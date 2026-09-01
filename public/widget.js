(function () {
  if (window.__FNE_WIDGET_LOADED__) return;
  window.__FNE_WIDGET_LOADED__ = true;

  // Identify the script tag and attributes
  const currentScript =
    document.currentScript ||
    document.querySelector('script[src*="widget.js"]');

  const position = currentScript ? (currentScript.getAttribute("data-position") || "right") : "right";
  const bottomParam = currentScript ? currentScript.getAttribute("data-bottom") : null;
  const bottomOffset = bottomParam ? parseInt(bottomParam, 10) : 75; // Raised default from 24px to 75px
  const windowBottom = bottomOffset + 74;

  // Detect script origin dynamically
  let origin = "";
  if (currentScript && currentScript.src) {
    try {
      origin = new URL(currentScript.src).origin;
    } catch (_) {}
  }
  if (!origin || origin === "null") {
    origin = window.location.origin;
  }

  // If host website is loaded over HTTPS, prevent Mixed Content blocking by upgrading HTTP to HTTPS domain
  if (window.location.protocol === "https:" && origin.startsWith("http:")) {
    if (origin.includes("158.69.24.123") || origin.includes("localhost")) {
      origin = "https://ns516856.ip-158-69-24.net";
    } else {
      origin = origin.replace("http:", "https:").replace(/:3000$/, "");
    }
  }

  const chatUrl = `${origin}/web-chat?embed=true`;

  // Inject Styles
  const style = document.createElement("style");
  style.id = "fne-chat-widget-styles";
  style.textContent = `
    .fne-chat-root {
      position: fixed;
      bottom: ${bottomOffset}px;
      right: 24px;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Cairo', sans-serif;
      direction: rtl;
    }
    .fne-chat-root[data-position="left"] {
      right: auto !important;
      left: 24px !important;
    }

    /* Floating Launcher Button with modern emerald-to-red FNE gradient */
    .fne-chat-btn {
      width: 62px;
      height: 62px;
      border-radius: 50%;
      background: linear-gradient(135deg, #059669 0%, #047857 45%, #b51f2b 100%);
      box-shadow: 0 10px 25px -3px rgba(181, 31, 43, 0.4), 0 4px 6px -2px rgba(4, 120, 87, 0.25);
      border: 2px solid rgba(255, 255, 255, 0.85);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      transition: all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      outline: none;
      position: relative;
      user-select: none;
    }
    .fne-chat-btn:hover {
      transform: scale(1.08) translateY(-2px);
      box-shadow: 0 14px 30px -3px rgba(181, 31, 43, 0.5), 0 6px 12px -2px rgba(4, 120, 87, 0.3);
    }
    .fne-chat-btn:active {
      transform: scale(0.96);
    }

    /* Online status indicator dot */
    .fne-chat-online-dot {
      position: absolute;
      bottom: 2px;
      left: 2px;
      width: 13px;
      height: 13px;
      background-color: #10b981;
      border: 2.5px solid #ffffff;
      border-radius: 50%;
      box-shadow: 0 0 8px rgba(16, 185, 129, 0.8);
    }

    /* Teaser / Greeting bubble */
    .fne-chat-teaser {
      position: absolute;
      bottom: 74px;
      right: 0;
      background: #ffffff;
      color: #27272a;
      padding: 10px 14px;
      border-radius: 16px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15), 0 2px 6px rgba(0,0,0,0.06);
      border: 1px solid #f1f5f9;
      font-size: 13px;
      line-height: 1.45;
      width: 250px;
      cursor: pointer;
      display: flex;
      align-items: flex-start;
      gap: 8px;
      animation: fne-fade-in-up 0.35s ease-out forwards;
      transition: all 0.2s ease;
    }
    .fne-chat-root[data-position="left"] .fne-chat-teaser {
      right: auto !important;
      left: 0 !important;
    }
    .fne-chat-teaser:hover {
      transform: translateY(-2px);
      box-shadow: 0 12px 35px rgba(0, 0, 0, 0.18);
    }
    .fne-chat-teaser-close {
      background: none;
      border: none;
      font-size: 16px;
      color: #94a3b8;
      cursor: pointer;
      padding: 0 2px;
      line-height: 1;
    }
    .fne-chat-teaser-close:hover {
      color: #ef4444;
    }

    /* Iframe Container */
    .fne-chat-window {
      position: fixed;
      bottom: ${windowBottom}px;
      right: 24px;
      width: 415px;
      height: 630px;
      max-height: calc(100dvh - ${windowBottom + 16}px);
      max-width: calc(100vw - 32px);
      background: #ffffff;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.08);
      z-index: 999998;
      opacity: 0;
      visibility: hidden;
      transform: scale(0.88) translateY(24px);
      transform-origin: bottom right;
      transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1),
                  transform 0.25s cubic-bezier(0.16, 1, 0.3, 1),
                  visibility 0.25s;
    }
    .fne-chat-window[data-position="left"] {
      right: auto !important;
      left: 24px !important;
      transform-origin: bottom left !important;
    }

    .fne-chat-window.fne-open {
      opacity: 1;
      visibility: visible;
      transform: scale(1) translateY(0);
    }

    .fne-chat-iframe {
      width: 100%;
      height: 100%;
      border: none;
      display: block;
    }

    /* Small screens / Laptops height adaptation */
    @media (max-height: 740px) and (min-width: 541px) {
      .fne-chat-window {
        bottom: 12px !important;
        height: calc(100dvh - 24px) !important;
        max-height: calc(100dvh - 24px) !important;
      }
    }

    /* Mobile fullscreen adaptation */
    @media (max-width: 540px) {
      .fne-chat-window {
        bottom: 0 !important;
        right: 0 !important;
        left: 0 !important;
        top: 0 !important;
        width: 100vw !important;
        width: 100dvw !important;
        height: 100vh !important;
        height: 100dvh !important;
        max-height: 100dvh !important;
        max-width: 100vw !important;
        border-radius: 0 !important;
        border: none !important;
      }
      .fne-chat-root {
        bottom: 16px;
        right: 16px;
      }
      .fne-chat-root[data-position="left"] {
        left: 16px !important;
        right: auto !important;
      }
      .fne-chat-root.fne-hidden-mobile {
        display: none !important;
      }
    }

    @keyframes fne-fade-in-up {
      from {
        opacity: 0;
        transform: translateY(12px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `;

  // Create Widget Root
  const root = document.createElement("div");
  root.id = "fne-chat-root";
  root.className = "fne-chat-root";
  root.setAttribute("data-position", position);

  // Launcher Button
  const btn = document.createElement("button");
  btn.className = "fne-chat-btn";
  btn.setAttribute("aria-label", "المساعد الذكي للجامعة الوطنية للتعليم FNE");
  btn.innerHTML = `
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 8V4H8"></path>
      <rect width="16" height="12" x="4" y="8" rx="2"></rect>
      <path d="M2 14h2"></path>
      <path d="M20 14h2"></path>
      <path d="M15 13v2"></path>
      <path d="M9 13v2"></path>
    </svg>
    <span class="fne-chat-online-dot"></span>
  `;

  // Teaser Bubble
  const teaser = document.createElement("div");
  teaser.className = "fne-chat-teaser";
  teaser.style.display = "none";
  teaser.innerHTML = `
    <div style="flex: 1;">
      <strong style="color: #b51f2b; display: block; font-size: 13px; margin-bottom: 2px;">تحية نضالية 🇲🇦🌹</strong>
      تحتاج مساعدة إدارية أو نقابية؟ اضغط للتحدث مع المساعد الذكي FNE 💬
    </div>
    <button class="fne-chat-teaser-close" title="إغلاق">&times;</button>
  `;

  root.appendChild(teaser);
  root.appendChild(btn);

  // Iframe Window
  const windowEl = document.createElement("div");
  windowEl.id = "fne-chat-window";
  windowEl.className = "fne-chat-window";
  windowEl.setAttribute("data-position", position);
  windowEl.innerHTML = `
    <iframe class="fne-chat-iframe" src="${chatUrl}" allow="clipboard-write"></iframe>
  `;

  let isOpen = false;

  function toggleChat(openState) {
    isOpen = typeof openState === "boolean" ? openState : !isOpen;
    if (isOpen) {
      windowEl.classList.add("fne-open");
      teaser.style.display = "none";
      root.classList.add("fne-hidden-mobile");
      btn.innerHTML = `
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      `;
    } else {
      windowEl.classList.remove("fne-open");
      root.classList.remove("fne-hidden-mobile");
      btn.innerHTML = `
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 8V4H8"></path>
          <rect width="16" height="12" x="4" y="8" rx="2"></rect>
          <path d="M2 14h2"></path>
          <path d="M20 14h2"></path>
          <path d="M15 13v2"></path>
          <path d="M9 13v2"></path>
        </svg>
        <span class="fne-chat-online-dot"></span>
      `;
    }
  }

  btn.addEventListener("click", () => toggleChat());
  teaser.addEventListener("click", function (e) {
    if (e.target && e.target.classList && e.target.classList.contains("fne-chat-teaser-close")) {
      e.stopPropagation();
      teaser.style.display = "none";
    } else {
      toggleChat(true);
    }
  });

  // Show teaser bubble after 3.5s delay if chat was never opened
  setTimeout(() => {
    if (!isOpen && !sessionStorage.getItem("fne_teaser_dismissed")) {
      teaser.style.display = "flex";
    }
  }, 3500);

  teaser.querySelector(".fne-chat-teaser-close")?.addEventListener("click", (e) => {
    e.stopPropagation();
    teaser.style.display = "none";
    sessionStorage.setItem("fne_teaser_dismissed", "1");
  });

  // Listen to postMessage from inside iframe (e.g. user clicked X in iframe header)
  window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "fne-chat-close") {
      toggleChat(false);
    }
  });

  // Safe DOM mount: handles execution in <head>, async scripts, or after DOMContentLoaded
  function mount() {
    if (!document.body) {
      setTimeout(mount, 50);
      return;
    }
    if (document.getElementById("fne-chat-root")) return;
    document.head.appendChild(style);
    document.body.appendChild(root);
    document.body.appendChild(windowEl);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
