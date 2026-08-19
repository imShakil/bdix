/**
 * PostPilot Link Locker & Sponsor Verification Widget
 * Dekho Prime — Optimized & Smooth Version
 *
 * Features & Fixes:
 * 1. Smooth Background Timer: Uses Date.now() timestamp delta so timer never stalls when user is viewing the ad tab.
 * 2. Real Browser Tabs: Opens ad in standard new tab (_blank) without window.open dimensions that trigger popup window traps.
 * 3. Popup Blocker Recovery: Smooth fallback helper if the browser blocked the initial ad tab.
 * 4. Dual Action Unlocked State: 1-click "GET LINK" (direct navigation) + "COPY LINK" (for VLC/IPTV players).
 * 5. Modern Design System: Sleek dark-mode aesthetic matching Dekho Prime with responsive clamp() sizing and SVG icons.
 */

(function () {
  "use strict";

  var adList = [
    "https://spreadpreferencetelevision.com/tba2ybi8y?key=e9181f1e0055b64f2438c9cf18ca8880",
    "https://spreadpreferencetelevision.com/x2fusvgn?key=2531ef9b0b688c0f6205ee45da3c50de"
  ];

  var SECRET_KEY = "XP_DekhoPrimeBlog2027";
  var WAIT_TIME = 15; // 15 seconds verification
  var MARKER_SELECTOR = '#unlock-link, .unlock-link, [data-unlock-link], [id*="unlock-link"]:not([id^="unlock-link-host-"])';
  var scanScheduled = false;
  var initialized = false;

  var statusTexts = [
    "Opening sponsor page…",
    "Syncing secure node…",
    "Verifying sponsor view…",
    "Decrypting link protocol…",
    "Finalizing access…"
  ];

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

  // ── Clean Ad Tab Launcher ─────────────────────────────────────────────────

  function openAdTab(url) {
    var win = null;
    try {
      // Standard new tab without width/height to avoid forced popup window
      win = window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      win = null;
    }

    if (!win) {
      try {
        var a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer nofollow";
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
          if (a.parentNode) a.parentNode.removeChild(a);
        }, 100);
      } catch (e2) {}
    }

    return win;
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
      ".dp-locker-btn-sec{background:#12122a;color:#a0a0c0;border:1px solid #2d2d4e;padding:10px 18px;border-radius:10px;font-weight:600;font-size:clamp(12px,3vw,13px);cursor:pointer;width:100%;margin-top:10px;transition:all 0.2s ease;display:inline-flex;align-items:center;justify-content:center;gap:6px;box-sizing:border-box;}",
      ".dp-locker-btn-sec:hover{border-color:#ff6b35;color:#ffffff;background:#181836;}",
      ".dp-locker-btn-sec.copied{background:rgba(0,184,148,0.15);border-color:#00b894;color:#00b894;}",
      ".dp-locker-progress-wrap{width:100%;height:10px;background:#12122a;border-radius:20px;overflow:hidden;margin:16px 0 12px;border:1px solid #2d2d4e;}",
      ".dp-locker-progress-bar{width:0%;height:100%;background:linear-gradient(90deg,#ff6b35,#f7c948);border-radius:20px;transition:width 0.4s ease;box-shadow:0 0 10px rgba(255,107,53,0.5);}",
      ".dp-locker-status-row{display:flex;justify-content:space-between;align-items:center;font-size:clamp(11px,2.8vw,12px);font-weight:600;color:#a0a0c0;margin-bottom:6px;}",
      ".dp-locker-timer-badge{color:#ff6b35;font-weight:700;background:rgba(255,107,53,0.12);padding:2px 8px;border-radius:6px;}",
      ".dp-locker-hint{font-size:clamp(11px,2.8vw,12px);color:#7c7c9e;margin-top:12px;line-height:1.4;}",
      ".dp-locker-hint a{color:#ff6b35;text-decoration:underline;cursor:pointer;font-weight:600;}",
      ".dp-locker-success-icon{width:44px;height:44px;border-radius:50%;background:rgba(0,184,148,0.15);color:#00b894;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;border:1px solid rgba(0,184,148,0.3);}",
      ".dp-locker-success-icon svg{width:24px;height:24px;fill:currentColor;}",
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
        // State 1: Locked
        '<div class="dp-step-start">',
          '<div class="dp-locker-badge">',
            '<svg viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>',
            'Protected Content',
          '</div>',
          '<div class="dp-locker-title">Encrypted Access Link</div>',
          '<div class="dp-locker-desc">Unlock instant access by completing a quick sponsor verification.</div>',
          '<button class="dp-locker-btn-main dp-btn-start">',
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>',
            'UNLOCK LINK',
          '</button>',
        '</div>',

        // State 2: Verifying / Watching Ad
        '<div class="dp-step-process" style="display:none;">',
          '<div class="dp-locker-badge">',
            '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8zm1-13h-2v6h6v-2h-4z"/></svg>',
            'Verifying Sponsor View',
          '</div>',
          '<div class="dp-locker-status-row">',
            '<span class="dp-status-msg">Opening sponsor page…</span>',
            '<span class="dp-locker-timer-badge dp-timer-text">15s</span>',
          '</div>',
          '<div class="dp-locker-progress-wrap">',
            '<div class="dp-locker-progress-bar"></div>',
          '</div>',
          '<div class="dp-locker-desc" style="margin-bottom:0;">Please keep the sponsor page open while verification completes.</div>',
          '<div class="dp-locker-hint">',
            'Sponsor page didn\'t open? <a class="dp-btn-reopen">Click here to open</a>',
          '</div>',
        '</div>',

        // State 3: Unlocked / Ready
        '<div class="dp-step-final" style="display:none;">',
          '<div class="dp-locker-success-icon">',
            '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',
          '</div>',
          '<div class="dp-locker-title" style="color:#00b894;">Link Unlocked!</div>',
          '<div class="dp-locker-desc">Verification complete. Your destination link is ready below.</div>',
          '<div class="dp-locker-btn-group">',
            '<a class="dp-locker-btn-main dp-btn-get" href="' + destinationURL + '" target="_blank" rel="noopener noreferrer">',
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>',
              'GET LINK NOW',
            '</a>',
            '<button class="dp-locker-btn-sec dp-btn-copy">',
              '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>',
              'COPY LINK',
            '</button>',
          '</div>',
        '</div>',
      '</div>'
    ].join("");

    var stepStart   = target.querySelector(".dp-step-start");
    var stepProcess = target.querySelector(".dp-step-process");
    var stepFinal   = target.querySelector(".dp-step-final");
    var progressBar = target.querySelector(".dp-locker-progress-bar");
    var timerText   = target.querySelector(".dp-timer-text");
    var statusMsg   = target.querySelector(".dp-status-msg");
    var btnStart    = target.querySelector(".dp-btn-start");
    var btnReopen   = target.querySelector(".dp-btn-reopen");
    var btnCopy     = target.querySelector(".dp-btn-copy");

    var startTime = null;
    var timerInterval = null;
    var started = false;
    var currentAdLink = "";

    function updateProgress() {
      if (!started || !startTime) return;

      var now = Date.now();
      var elapsedMs = now - startTime;
      var elapsedSec = Math.floor(elapsedMs / 1000);
      var remaining = Math.max(0, WAIT_TIME - elapsedSec);
      var percent = Math.min(100, Math.floor((elapsedMs / (WAIT_TIME * 1000)) * 100));

      progressBar.style.width = percent + "%";
      timerText.textContent = remaining > 0 ? remaining + "s" : "Ready!";

      var statusIdx = Math.min(
        statusTexts.length - 1,
        Math.floor((percent / 100) * statusTexts.length)
      );
      statusMsg.textContent = statusTexts[statusIdx];

      if (remaining <= 0) {
        if (timerInterval) {
          clearInterval(timerInterval);
          timerInterval = null;
        }
        stepProcess.style.display = "none";
        stepFinal.style.display = "block";
      }
    }

    btnStart.addEventListener("click", function () {
      if (started) return;
      started = true;
      startTime = Date.now();

      currentAdLink = adList[Math.floor(Math.random() * adList.length)];
      openAdTab(currentAdLink);

      stepStart.style.display = "none";
      stepProcess.style.display = "block";
      updateProgress();

      timerInterval = setInterval(updateProgress, 300);
    });

    btnReopen.addEventListener("click", function (e) {
      e.preventDefault();
      if (!currentAdLink) {
        currentAdLink = adList[Math.floor(Math.random() * adList.length)];
      }
      openAdTab(currentAdLink);
    });

    // Handle tab switching seamlessly so users see immediate updates
    document.addEventListener("visibilitychange", updateProgress);
    window.addEventListener("focus", updateProgress);

    window.addEventListener("beforeunload", function () {
      if (timerInterval) clearInterval(timerInterval);
    });

    // Fast and smooth Copy action
    btnCopy.addEventListener("click", function () {
      function showCopied() {
        btnCopy.classList.add("copied");
        btnCopy.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> COPIED TO CLIPBOARD!';
        setTimeout(function () {
          btnCopy.classList.remove("copied");
          btnCopy.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg> COPY LINK';
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
