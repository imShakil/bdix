/**
 * PostPilot Link Locker & Sponsor Verification Widget
 * Dekho Prime — Adsterra Smartlink dwell lock
 * Author: @imShakil
 * Updated: 24th August, 2026
 * Unlock rules:
 * 1. Ad blocker must be paused (Smartlink host reachable). Site-only allowlist is not enough.
 * 2. One Adsterra Smartlink tab is opened and we keep the Window handle (no noopener).
 * 3. 15s accrues only while that tab is still open AND the locker is in the background.
 * 4. Closing the Smartlink tab before 15s resets progress to 0.
 * 5. Destination href is not written into the DOM until dwell completes.
 */

(function () {
  "use strict";

  var adList = [
    "https://spreadpreferencetelevision.com/tba2ybi8y?key=e9181f1e0055b64f2438c9cf18ca8880",
    "https://spreadpreferencetelevision.com/x2fusvgn?key=2531ef9b0b688c0f6205ee45da3c50de"
  ];

  var SECRET_KEY = "XP_DekhoPrimeBlog2027";
  var WAIT_TIME = 15;
  var REQUIRED_MS = WAIT_TIME * 1000;
  var TICK_MS = 300;
  var HOST_PROBE_MS = 4000;
  var MARKER_SELECTOR = '#unlock-link, .unlock-link, [data-unlock-link], [id*="unlock-link"]:not([id^="unlock-link-host-"])';
  var scanScheduled = false;
  var initialized = false;

  var watchingStatusTexts = [
    "Keep the Adsterra tab open…",
    "Stay on the sponsor page…",
    "Verifying sponsor view…",
    "Almost there — do not close it…",
    "Finalizing access…"
  ];

  var GET_LINK_LABEL = [
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>',
    "GET LINK NOW"
  ].join("");

  var COPY_LINK_LABEL = [
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>',
    "COPY LINK"
  ].join("");

  var COPIED_LABEL = [
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',
    "COPIED TO CLIPBOARD!"
  ].join("");

  // ── Crypto & URL Parsing ──────────────────────────────────────────────────

  function xorDecrypt(hex, key) {
    var result = "";
    for (var i = 0; i < hex.length; i += 2) {
      var code = parseInt(hex.substr(i, 2), 16) ^ key.charCodeAt((i / 2) % key.length);
      result += String.fromCharCode(code);
    }
    return result;
  }

  function normalizeUrl(value) {
    var raw = (value || "").trim();
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    if (/^\/\//.test(raw)) return "https:" + raw;
    if (/^[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?(?:\/|$)/i.test(raw)) {
      return "https://" + raw;
    }
    return "";
  }

  function extractUrlLike(value) {
    var raw = (value || "").trim();
    if (!raw) return "";
    var m = raw.match(/https?:\/\/[^\s"'<>]+|\/\/[^\s"'<>]+|[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?\/[^\s"'<>]+/i);
    return m ? m[0] : "";
  }

  function extractHexPayload(value) {
    var raw = (value || "").trim();
    if (!raw) return "";
    var compact = raw.replace(/\s+/g, "");
    if (/^[0-9a-f]+$/i.test(compact) && compact.length >= 16 && compact.length % 2 === 0) {
      return compact;
    }
    var m = compact.match(/[0-9a-f]{16,}/gi);
    if (!m) return "";
    for (var i = 0; i < m.length; i++) {
      if (m[i].length % 2 === 0) return m[i];
    }
    return "";
  }

  function pickSmartlink() {
    return adList[Math.floor(Math.random() * adList.length)];
  }

  function getProbeUrl() {
    var url = adList[0] || "";
    return url + (url.indexOf("?") >= 0 ? "&" : "?") + "dp_probe=" + Date.now();
  }

  // ── Adsterra tab launcher (keep handle so we can poll closed) ─────────────

  function openAdTab(url) {
    var win = null;
    try {
      win = window.open(url, "_blank");
    } catch (e) {
      win = null;
    }
    if (!win) return null;
    try {
      if (win.closed) return null;
    } catch (e2) {
      return null;
    }
    return win;
  }

  function isAdOpen(win) {
    if (!win) return false;
    try {
      return !win.closed;
    } catch (e) {
      return false;
    }
  }

  function isLockerHidden() {
    return document.hidden === true || document.visibilityState === "hidden";
  }

  // ── Adblock probes ────────────────────────────────────────────────────────

  function probeCosmeticBait() {
    var bait = document.createElement("div");
    bait.className = "pub_300x250 pub_300x250m pub_728x90 text-ad textAd text_ad adsbox adsbygoogle ad-banner advertisement ad-placement carbon-ads";
    bait.setAttribute("aria-hidden", "true");
    bait.innerHTML = "&nbsp;";
    bait.style.cssText = "width:1px!important;height:1px!important;position:absolute!important;left:-10000px!important;top:-1000px!important;pointer-events:none!important;";
    document.body.appendChild(bait);

    var blocked = false;
    try {
      var style = window.getComputedStyle(bait);
      blocked = (
        bait.offsetParent === null ||
        bait.offsetHeight === 0 ||
        bait.offsetWidth === 0 ||
        bait.clientHeight === 0 ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0"
      );
    } catch (e) {
      blocked = false;
    }

    if (bait.parentNode) bait.parentNode.removeChild(bait);
    return blocked;
  }

  function probeSmartlinkHost(done) {
    if (typeof fetch !== "function") {
      done(false);
      return;
    }

    var finished = false;
    var timer = setTimeout(function () {
      finish(true);
    }, HOST_PROBE_MS);

    function finish(blocked) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      done(blocked);
    }

    fetch(getProbeUrl(), {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      credentials: "omit",
      redirect: "follow"
    }).then(function () {
      finish(false);
    }).catch(function () {
      finish(true);
    });
  }

  function detectAdBlock(done) {
    var cosmeticBlocked = false;
    try {
      cosmeticBlocked = probeCosmeticBait();
    } catch (e) {
      cosmeticBlocked = false;
    }

    probeSmartlinkHost(function (hostBlocked) {
      done(!!(cosmeticBlocked || hostBlocked));
    });
  }

  // ── Styles (Dekho Prime Theme) ────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById("dp-locker-styles")) return;
    var style = document.createElement("style");
    style.id = "dp-locker-styles";
    style.textContent = [
      ".dp-locker-card{font-family:inherit;background:#1a1a2e;border:1px solid #2d2d4e;border-radius:14px;padding:clamp(16px,4vw,24px);margin:clamp(16px,4vw,28px) auto;max-width:480px;width:100%;box-sizing:border-box;position:relative;overflow:hidden;color:#e0e0e0;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,0.3);}",
      ".dp-locker-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#ff6b35,#f7c948);border-radius:14px 14px 0 0;}",
      ".dp-locker-badge{display:inline-flex;align-items:center;gap:6px;font-size:clamp(10px,2.5vw,11px);font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#ff6b35;margin-bottom:12px;}",
      ".dp-locker-badge svg{width:14px;height:14px;fill:currentColor;flex-shrink:0;}",
      ".dp-locker-title{font-size:clamp(15px,3.8vw,18px);font-weight:700;color:#ffffff;margin:0 0 8px;line-height:1.3;}",
      ".dp-locker-desc{font-size:clamp(12px,3vw,13px);color:#9e9eb7;margin:0 0 18px;line-height:1.5;}",
      ".dp-locker-btn-main{background:linear-gradient(90deg,#ff6b35,#f7a635);color:#ffffff;border:none;padding:12px 20px;border-radius:10px;font-weight:700;font-size:clamp(13px,3.2vw,14px);cursor:pointer;width:100%;transition:all 0.2s ease;display:inline-flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;box-sizing:border-box;box-shadow:0 4px 15px rgba(255,107,53,0.3);}",
      ".dp-locker-btn-main:hover{opacity:0.92;transform:translateY(-1px);box-shadow:0 6px 20px rgba(255,107,53,0.45);}",
      ".dp-locker-btn-main:active{transform:translateY(0);}",
      ".dp-locker-btn-main:disabled{opacity:0.65;cursor:wait;transform:none;box-shadow:none;}",
      ".dp-locker-btn-main:disabled:hover{opacity:0.65;transform:none;box-shadow:none;}",
      ".dp-locker-btn-sec{background:#12122a;color:#a0a0c0;border:1px solid #2d2d4e;padding:10px 18px;border-radius:10px;font-weight:600;font-size:clamp(12px,3vw,13px);cursor:pointer;width:100%;margin-top:10px;transition:all 0.2s ease;display:inline-flex;align-items:center;justify-content:center;gap:6px;box-sizing:border-box;}",
      ".dp-locker-btn-sec:hover{border-color:#ff6b35;color:#ffffff;background:#181836;}",
      ".dp-locker-btn-sec.copied{background:rgba(0,184,148,0.15);border-color:#00b894;color:#00b894;}",
      ".dp-locker-progress-wrap{width:100%;height:10px;background:#12122a;border-radius:20px;overflow:hidden;margin:16px 0 12px;border:1px solid #2d2d4e;}",
      ".dp-locker-progress-bar{width:0%;height:100%;background:linear-gradient(90deg,#ff6b35,#f7c948);border-radius:20px;transition:width 0.3s linear;box-shadow:0 0 10px rgba(255,107,53,0.5);}",
      ".dp-locker-progress-bar.is-paused{opacity:0.45;}",
      ".dp-locker-status-row{display:flex;justify-content:space-between;align-items:center;font-size:clamp(11px,2.8vw,12px);font-weight:600;color:#a0a0c0;margin-bottom:6px;gap:8px;}",
      ".dp-locker-timer-badge{color:#ff6b35;font-weight:700;background:rgba(255,107,53,0.12);padding:2px 8px;border-radius:6px;flex-shrink:0;}",
      ".dp-locker-timer-badge.is-paused{color:#f7c948;background:rgba(247,201,72,0.12);}",
      ".dp-locker-hint{font-size:clamp(11px,2.8vw,12px);color:#7c7c9e;margin-top:12px;line-height:1.4;}",
      ".dp-locker-hint a{color:#ff6b35;text-decoration:underline;cursor:pointer;font-weight:600;}",
      ".dp-locker-success-icon{width:44px;height:44px;border-radius:50%;background:rgba(0,184,148,0.15);color:#00b894;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;border:1px solid rgba(0,184,148,0.3);}",
      ".dp-locker-success-icon svg{width:24px;height:24px;fill:currentColor;}",
      ".dp-locker-warn-icon{width:44px;height:44px;border-radius:50%;background:rgba(255,107,53,0.12);color:#ff6b35;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;border:1px solid rgba(255,107,53,0.3);}",
      ".dp-locker-warn-icon svg{width:24px;height:24px;fill:currentColor;}",
      ".dp-locker-btn-group{display:flex;flex-direction:column;gap:10px;margin-top:16px;}",
      ".dp-locker-placeholder{color:#7c7c9e;font-size:13px;padding:12px 0;}"
    ].join("");
    document.head.appendChild(style);
  }

  // ── UI Renderer ───────────────────────────────────────────────────────────

  function renderLocker(target, destinationURL) {
    target.style.display = "block";
    target.innerHTML = [
      '<div class="dp-locker-card">',
        '<div class="dp-step-start">',
          '<div class="dp-locker-badge">',
            '<svg viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>',
            "Protected Content",
          "</div>",
          '<div class="dp-locker-title">Encrypted Access Link</div>',
          '<div class="dp-locker-desc">Unlock access by opening the sponsor page and staying on it for 15 seconds. Pause your ad blocker first — allowlisting only this site is not enough.</div>',
          '<button type="button" class="dp-locker-btn-main dp-btn-start">',
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>',
            "UNLOCK LINK",
          "</button>",
        "</div>",

        '<div class="dp-step-blocked" style="display:none;">',
          '<div class="dp-locker-warn-icon">',
            '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>',
          "</div>",
          '<div class="dp-locker-badge">Ad Blocker Detected</div>',
          '<div class="dp-locker-title">Pause your ad blocker</div>',
          '<div class="dp-locker-desc">The sponsor page cannot load while an ad blocker is on. Pause or turn it off completely (not just this site), then try again.</div>',
          '<button type="button" class="dp-locker-btn-main dp-btn-retry">I paused it — try again</button>',
        "</div>",

        '<div class="dp-step-process" style="display:none;">',
          '<div class="dp-locker-badge dp-process-badge">Verifying Sponsor View</div>',
          '<div class="dp-locker-status-row">',
            '<span class="dp-status-msg">Opening sponsor page…</span>',
            '<span class="dp-locker-timer-badge dp-timer-text">' + WAIT_TIME + "s</span>",
          "</div>",
          '<div class="dp-locker-progress-wrap">',
            '<div class="dp-locker-progress-bar"></div>',
          "</div>",
          '<div class="dp-locker-desc dp-process-desc" style="margin-bottom:0;">Keep the Adsterra tab open for 15 seconds. Do not close it.</div>',
          '<div class="dp-locker-hint">',
            '<a class="dp-btn-reopen">Open the Adsterra tab</a>',
          "</div>",
        "</div>",

        '<div class="dp-step-final" style="display:none;">',
          '<div class="dp-locker-success-icon">',
            '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',
          "</div>",
          '<div class="dp-locker-title" style="color:#00b894;">Link Unlocked!</div>',
          '<div class="dp-locker-desc">Verification complete. Your destination link is ready below.</div>',
          '<div class="dp-locker-btn-group">',
            '<button type="button" class="dp-locker-btn-main dp-btn-get">',
              GET_LINK_LABEL,
            "</button>",
            '<button type="button" class="dp-locker-btn-sec dp-btn-copy">',
              COPY_LINK_LABEL,
            "</button>",
          "</div>",
        "</div>",
      "</div>"
    ].join("");

    var stepStart = target.querySelector(".dp-step-start");
    var stepBlocked = target.querySelector(".dp-step-blocked");
    var stepProcess = target.querySelector(".dp-step-process");
    var stepFinal = target.querySelector(".dp-step-final");
    var progressBar = target.querySelector(".dp-locker-progress-bar");
    var timerText = target.querySelector(".dp-timer-text");
    var statusMsg = target.querySelector(".dp-status-msg");
    var processDesc = target.querySelector(".dp-process-desc");
    var processBadge = target.querySelector(".dp-process-badge");
    var btnStart = target.querySelector(".dp-btn-start");
    var btnRetry = target.querySelector(".dp-btn-retry");
    var btnReopen = target.querySelector(".dp-btn-reopen");
    var btnCopy = target.querySelector(".dp-btn-copy");

    var adWin = null;
    var currentAdLink = "";
    var accruedMs = 0;
    var lastTick = 0;
    var timerInterval = null;
    var processActive = false;
    var unlocked = false;
    var busy = false;
    var everOpened = false;
    var lastOpenFailed = false;
    var processMode = "watching";

    function showStep(step) {
      stepStart.style.display = step === "start" ? "block" : "none";
      stepBlocked.style.display = step === "blocked" ? "block" : "none";
      stepProcess.style.display = step === "process" ? "block" : "none";
      stepFinal.style.display = step === "final" ? "block" : "none";
    }

    function remainingSec() {
      return Math.max(0, Math.ceil((REQUIRED_MS - accruedMs) / 1000));
    }

    function renderBar() {
      var percent = Math.min(100, Math.floor((accruedMs / REQUIRED_MS) * 100));
      progressBar.style.width = percent + "%";
      timerText.textContent = remainingSec() > 0 ? remainingSec() + "s" : "Ready!";
    }

    function setProcessCopy(mode) {
      processMode = mode;
      var paused = mode === "paused";
      progressBar.classList.toggle("is-paused", paused);
      timerText.classList.toggle("is-paused", paused);

      if (mode === "watching") {
        var percent = Math.min(100, Math.floor((accruedMs / REQUIRED_MS) * 100));
        var statusIdx = Math.min(
          watchingStatusTexts.length - 1,
          Math.floor((percent / 100) * watchingStatusTexts.length)
        );
        processBadge.textContent = "Verifying Sponsor View";
        statusMsg.textContent = watchingStatusTexts[statusIdx];
        processDesc.textContent = "Keep the Adsterra tab open for 15 seconds. Do not close it.";
        return;
      }

      if (mode === "paused") {
        processBadge.textContent = "Timer Paused";
        statusMsg.textContent = "Return to the Adsterra tab to continue";
        processDesc.textContent = "Go back to the Adsterra tab and stay there (" + remainingSec() + "s left). Time does not count while you are here.";
        return;
      }

      if (mode === "closed") {
        processBadge.textContent = "Tab Closed";
        statusMsg.textContent = "You closed the ad too soon";
        processDesc.textContent = "You closed the ad too soon. Open it again and stay 15 seconds.";
        return;
      }

      processBadge.textContent = "Popup Blocked";
      statusMsg.textContent = "Adsterra tab did not open";
      processDesc.textContent = "Your browser blocked the sponsor tab. Tap below to open the Adsterra page, then stay on it for 15 seconds.";
    }

    function stopTimer() {
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
    }

    function startTimer() {
      if (timerInterval || unlocked) return;
      timerInterval = setInterval(tick, TICK_MS);
    }

    function resetDwell() {
      accruedMs = 0;
      lastTick = 0;
      renderBar();
    }

    function revealGetLink() {
      var old = target.querySelector(".dp-btn-get");
      if (!old || old.tagName === "A") return;
      var a = document.createElement("a");
      a.className = old.className;
      a.href = destinationURL;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.innerHTML = GET_LINK_LABEL;
      old.parentNode.replaceChild(a, old);
    }

    function unlock() {
      if (unlocked) return;
      if (accruedMs < REQUIRED_MS) return;
      unlocked = true;
      processActive = false;
      stopTimer();
      revealGetLink();
      showStep("final");
    }

    function tick() {
      if (unlocked || !processActive) return;

      var now = Date.now();
      var open = isAdOpen(adWin);
      var hidden = isLockerHidden();

      if (open && hidden) {
        if (lastTick) {
          accruedMs += now - lastTick;
        }
        lastTick = now;
      } else {
        lastTick = 0;
      }

      if (accruedMs >= REQUIRED_MS) {
        renderBar();
        unlock();
        return;
      }

      if (!open) {
        if (lastOpenFailed) {
          setProcessCopy("popup");
        } else if (everOpened) {
          accruedMs = 0;
          setProcessCopy("closed");
        } else {
          setProcessCopy("popup");
        }
        renderBar();
        return;
      }

      setProcessCopy(hidden ? "watching" : "paused");
      renderBar();
    }

    function attachAdWindow(win) {
      adWin = win;
      if (isAdOpen(adWin)) {
        everOpened = true;
        lastOpenFailed = false;
        lastTick = 0;
        return true;
      }
      adWin = null;
      lastOpenFailed = true;
      return false;
    }

    function beginDwell() {
      if (unlocked) return;
      if (!currentAdLink) currentAdLink = pickSmartlink();

      processActive = true;
      showStep("process");
      renderBar();

      if (!attachAdWindow(openAdTab(currentAdLink))) {
        setProcessCopy("popup");
        renderBar();
        startTimer();
        return;
      }

      setProcessCopy(isLockerHidden() ? "watching" : "paused");
      startTimer();
      tick();
    }

    function runUnlockAttempt() {
      if (unlocked || busy) return;
      busy = true;

      var startHtml = btnStart.innerHTML;
      btnStart.disabled = true;
      btnRetry.disabled = true;
      btnStart.textContent = "Checking…";
      btnRetry.textContent = "Checking…";

      detectAdBlock(function (blocked) {
        busy = false;
        btnStart.disabled = false;
        btnRetry.disabled = false;
        btnStart.innerHTML = startHtml;
        btnRetry.textContent = "I paused it — try again";

        if (blocked) {
          processActive = false;
          adWin = null;
          everOpened = false;
          resetDwell();
          stopTimer();
          showStep("blocked");
          return;
        }

        beginDwell();
      });
    }

    function reopenSmartlink(e) {
      if (e) e.preventDefault();
      if (unlocked || busy) return;
      busy = true;

      detectAdBlock(function (blocked) {
        busy = false;
        if (blocked) {
          processActive = false;
          adWin = null;
          everOpened = false;
          resetDwell();
          stopTimer();
          showStep("blocked");
          return;
        }

        if (!currentAdLink) currentAdLink = pickSmartlink();
        processActive = true;
        showStep("process");

        if (!attachAdWindow(openAdTab(currentAdLink))) {
          setProcessCopy("popup");
          renderBar();
          startTimer();
          return;
        }

        setProcessCopy(isLockerHidden() ? "watching" : "paused");
        startTimer();
        tick();
      });
    }

    btnStart.addEventListener("click", runUnlockAttempt);
    btnRetry.addEventListener("click", runUnlockAttempt);
    btnReopen.addEventListener("click", reopenSmartlink);

    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    window.addEventListener("blur", tick);

    window.addEventListener("beforeunload", function () {
      stopTimer();
    });

    btnCopy.addEventListener("click", function () {
      if (!unlocked) return;

      function showCopied() {
        btnCopy.classList.add("copied");
        btnCopy.innerHTML = COPIED_LABEL;
        setTimeout(function () {
          btnCopy.classList.remove("copied");
          btnCopy.innerHTML = COPY_LINK_LABEL;
        }, 2500);
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(destinationURL).then(showCopied).catch(function () {
          fallbackCopy(destinationURL, showCopied);
        });
      } else {
        fallbackCopy(destinationURL, showCopied);
      }
    });

    function fallbackCopy(text, cb) {
      var tmp = document.createElement("textarea");
      tmp.value = text;
      tmp.style.position = "fixed";
      tmp.style.left = "-9999px";
      document.body.appendChild(tmp);
      tmp.focus();
      tmp.select();
      try {
        document.execCommand("copy");
        if (cb) cb();
      } catch (e) {}
      document.body.removeChild(tmp);
    }
  }

  // ── Render Host Management ────────────────────────────────────────────────

  function getOrCreateRenderHost(node) {
    if (node.classList && node.classList.contains("unlock-link-host")) return node;

    var existingHostId = node.getAttribute("data-locker-host-id");
    if (existingHostId) {
      var existingHost = document.getElementById(existingHostId);
      if (existingHost) return existingHost;
    }

    var host = document.createElement("div");
    var hostId = "unlock-link-host-" + Math.random().toString(36).slice(2, 10);
    host.id = hostId;
    host.className = "unlock-link-host";

    if (node.parentNode) {
      node.parentNode.insertBefore(host, node.nextSibling);
    }

    node.setAttribute("data-locker-host-id", hostId);
    return host;
  }

  function isLockerHostNode(node) {
    return !!(node && node.nodeType === 1 && node.classList && node.classList.contains("unlock-link-host"));
  }

  function toElement(node) {
    if (!node) return null;
    if (node.nodeType === 1) return node;
    if (node.nodeType === 3) return node.parentElement;
    return null;
  }

  function isMarkerNode(node) {
    var el = toElement(node);
    if (!el || isLockerHostNode(el)) return false;
    try {
      return el.matches(MARKER_SELECTOR);
    } catch (e) {
      return false;
    }
  }

  function containsMarkerNode(node) {
    var el = toElement(node);
    if (!el || isLockerHostNode(el)) return false;
    if (isMarkerNode(el)) return true;
    if (!el.querySelector) return false;
    return !!el.querySelector(MARKER_SELECTOR);
  }

  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    setTimeout(function () {
      scanScheduled = false;
      scanAndInit();
    }, 50);
  }

  function scanAndInit() {
    var list = Array.prototype.slice.call(document.querySelectorAll(MARKER_SELECTOR));

    list.forEach(function (node) {
      if (isLockerHostNode(node)) return;

      var host = getOrCreateRenderHost(node);
      if (host !== node) node.style.display = "none";
      if (host.getAttribute("data-locker-init") === "true") return;

      var encrypted = (
        node.getAttribute("data-encrypted") ||
        node.getAttribute("data-token") ||
        node.getAttribute("data-url") ||
        node.textContent ||
        ""
      ).trim();

      if (!encrypted) {
        if (!host.querySelector(".dp-locker-card")) {
          host.style.display = "block";
          host.innerHTML = '<div class="dp-locker-card"><div class="dp-locker-placeholder">Preparing secure link…</div></div>';
        }
        return;
      }

      var decrypted = "";
      try {
        var directUrl = normalizeUrl(encrypted) || normalizeUrl(extractUrlLike(encrypted));
        if (directUrl) {
          decrypted = directUrl;
        } else {
          var hexPayload = extractHexPayload(encrypted);
          if (hexPayload) {
            decrypted = normalizeUrl(xorDecrypt(hexPayload, SECRET_KEY));
          }
        }
      } catch (e) {
        decrypted = "";
      }

      if (!decrypted) {
        host.style.display = "block";
        host.innerHTML = '<div class="dp-locker-card"><div class="dp-locker-title">Link Unavailable</div><div class="dp-locker-desc">Unlock payload is missing or invalid. Please refresh the page.</div></div>';
        host.removeAttribute("data-locker-init");
        return;
      }

      try {
        renderLocker(host, decrypted);
        host.setAttribute("data-locker-init", "true");
      } catch (e) {
        host.style.display = "block";
        host.innerHTML = '<div class="dp-locker-card"><div class="dp-locker-title">Link Unavailable</div><div class="dp-locker-desc">Failed to render unlock layout. Please refresh the page.</div></div>';
        host.setAttribute("data-locker-init", "true");
      }
    });
  }

  function init() {
    if (initialized) return;
    initialized = true;

    injectStyles();
    scanAndInit();

    new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var mutation = mutations[i];
        var targetEl = toElement(mutation.target);

        if (targetEl && targetEl.closest && targetEl.closest(".unlock-link-host")) continue;

        if (mutation.type === "characterData") {
          if (isMarkerNode(targetEl)) {
            scheduleScan();
            return;
          }
          continue;
        }

        if (mutation.type === "childList") {
          if (containsMarkerNode(targetEl)) {
            scheduleScan();
            return;
          }
          for (var j = 0; j < mutation.addedNodes.length; j++) {
            if (containsMarkerNode(mutation.addedNodes[j])) {
              scheduleScan();
              return;
            }
          }
        }
      }
    }).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
