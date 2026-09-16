// content.js — injected on every page; records clicks/inputs while a SnapGrab recording is active.
(() => {
  if (window.__snapgrabInjected) return;
  window.__snapgrabInjected = true;

  let recording = null; // { active: boolean }
  let host = null;
  let shadow = null;
  let pill = null;
  let pillCount = null;
  const lastValues = new WeakMap();

  function ensureOverlay() {
    if (host) return;
    host = document.createElement('div');
    host.style.all = 'initial';
    host.style.position = 'fixed';
    host.style.top = '0';
    host.style.left = '0';
    host.style.zIndex = '2147483647';
    host.style.pointerEvents = 'none';
    (document.documentElement || document.body).appendChild(host);
    shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      .ring {
        position: fixed; width: 36px; height: 36px; margin: -18px 0 0 -18px;
        border-radius: 50%; border: 3px solid #ff3b30;
        box-shadow: 0 0 0 4px rgba(255,59,48,.25); pointer-events: none;
        animation: snapgrab-pulse .55s ease-out;
      }
      @keyframes snapgrab-pulse { from { transform: scale(.4); opacity: .9; } to { transform: scale(1); opacity: 0; } }
      .pill {
        position: fixed; right: 20px; bottom: 20px; display: flex; align-items: center; gap: 10px;
        background: #111827; color: #fff; font: 600 13px/1.2 -apple-system,Segoe UI,Roboto,Arial,sans-serif;
        padding: 10px 14px; border-radius: 999px; box-shadow: 0 6px 20px rgba(0,0,0,.35); pointer-events: auto;
      }
      .dot { width: 9px; height: 9px; border-radius: 50%; background: #ff3b30; animation: snapgrab-blink 1.2s infinite; }
      @keyframes snapgrab-blink { 0%, 100% { opacity: 1; } 50% { opacity: .25; } }
      .stop { background: #fff; color: #111827; border: none; padding: 5px 10px; border-radius: 999px; font-weight: 700; cursor: pointer; }
      .stop:hover { background: #e5e7eb; }
    `;
    shadow.appendChild(style);
  }

  function showRing(x, y) {
    ensureOverlay();
    const ring = document.createElement('div');
    ring.className = 'ring';
    ring.style.left = x + 'px';
    ring.style.top = y + 'px';
    shadow.appendChild(ring);
    setTimeout(() => ring.remove(), 600);
  }

  function showPill(count) {
    ensureOverlay();
    if (!pill) {
      pill = document.createElement('div');
      pill.className = 'pill';

      const dot = document.createElement('span');
      dot.className = 'dot';

      pillCount = document.createElement('span');

      const stopBtn = document.createElement('button');
      stopBtn.className = 'stop';
      stopBtn.textContent = 'Stop';
      stopBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'SNAPGRAB_STOP_CLICK' });
      });

      pill.append(dot, pillCount, stopBtn);
      shadow.appendChild(pill);
    }
    pillCount.textContent = `Recording — ${count} step${count === 1 ? '' : 's'}`;
  }

  function hidePill() {
    if (host) {
      host.remove();
      host = null;
      shadow = null;
      pill = null;
      pillCount = null;
    }
  }

  function textOf(el) {
    return (
      el.getAttribute('aria-label') ||
      el.getAttribute('title') ||
      el.getAttribute('alt') ||
      el.getAttribute('placeholder') ||
      (el.innerText || el.value || '').trim() ||
      ''
    )
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
  }

  function labelFor(el) {
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l) return l.innerText.trim().slice(0, 80);
    }
    const parentLabel = el.closest('label');
    if (parentLabel) return parentLabel.innerText.trim().slice(0, 80);
    return textOf(el) || el.name || el.type || 'field';
  }

  function findActionableElement(el) {
    if (!el || !(el instanceof Element)) return el;
    return el.closest('button, a, input, select, textarea, [role="button"], summary') || el;
  }

  function isOverlayElement(el, e) {
    if (!host) return false;
    if (el === host || host.contains(el)) return true;
    if (e && typeof e.composedPath === 'function') {
      return e.composedPath().includes(host);
    }
    return false;
  }

  function describeClick(rawEl) {
    const el = findActionableElement(rawEl);
    const tag = (el.tagName || '').toLowerCase();
    const text = textOf(el) || textOf(rawEl);
    if (tag === 'a') return `Clicked the link "${text || el.href}"`;
    if (tag === 'button' || (tag === 'input' && ['button', 'submit'].includes(el.type)) || el.getAttribute('role') === 'button' || tag === 'summary') {
      return `Clicked the button "${text || 'button'}"`;
    }
    if (tag === 'input' && ['checkbox', 'radio'].includes(el.type)) {
      return `${el.checked ? 'Checked' : 'Unchecked'} "${labelFor(el)}"`;
    }
    if (tag === 'select') return `Selected an option in "${labelFor(el)}"`;
    return text ? `Clicked "${text}"` : 'Clicked on the page';
  }

  function isSensitive(el) {
    const type = (el.type || '').toLowerCase();
    const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();
    return type === 'password' || autocomplete.includes('cc-') || autocomplete.includes('password');
  }

  function describeInput(el) {
    const label = labelFor(el);
    if (isSensitive(el)) return `Entered a value into "${label}"`;
    const val = (el.value || '').trim().slice(0, 60);
    return val ? `Typed "${val}" into "${label}"` : `Cleared "${label}"`;
  }

  function sendCapture(payload) {
    chrome.runtime.sendMessage({ type: 'SNAPGRAB_CAPTURE', payload }).catch(() => {});
  }

  let preCaptureTimer = null;

  function onPointerDown(e) {
    if (!recording?.active) return;
    if (e.button !== 0) return; // only primary left-click
    const el = e.target;
    if (!el || isOverlayElement(el, e)) return;

    // Immediately hide our overlay so it won't appear in the screenshot
    if (host) host.style.visibility = 'hidden';

    // Ensure the compositor has rendered the frame with the overlay hidden,
    // then immediately trigger pre-capture before click / DOM mutation.
    requestAnimationFrame(() => {
      chrome.runtime.sendMessage({
        type: 'SNAPGRAB_PRE_CAPTURE',
      }).catch(() => {});
    });

    // Safety timeout: restore overlay if user dragged or cancelled click
    clearTimeout(preCaptureTimer);
    preCaptureTimer = setTimeout(() => {
      if (host) host.style.visibility = '';
    }, 800);
  }

  function onPointerCancel() {
    clearTimeout(preCaptureTimer);
    if (host) host.style.visibility = '';
  }

  function onClick(e) {
    if (!recording?.active) return;
    const el = e.target;
    if (!el || isOverlayElement(el, e)) return;

    clearTimeout(preCaptureTimer);

    // Show the visual ripple ring on screen for live feedback
    showRing(e.clientX, e.clientY);

    // Send the capture immediately — NO artificial delay!
    sendCapture({
      kind: 'click',
      description: describeClick(el),
      x: e.clientX,
      y: e.clientY,
      dpr: window.devicePixelRatio || 1,
    });
  }

  function commitInput(el) {
    if (!recording?.active) return;
    if (!el || !('value' in el)) return;
    const last = lastValues.get(el);
    if (last === el.value) return;
    lastValues.set(el, el.value);

    // Synchronously hide overlay before taking screenshot
    if (host) host.style.visibility = 'hidden';
    sendCapture({ kind: 'input', description: describeInput(el) });
  }

  function onChange(e) {
    const el = e.target;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) commitInput(el);
  }

  function onKeydown(e) {
    if (e.key === 'Enter' && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) commitInput(e.target);
  }

  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointercancel', onPointerCancel, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('change', onChange, true);
  document.addEventListener('keydown', onKeydown, true);

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'SNAPGRAB_PING') {
      sendResponse({ ok: true });
      return;
    }
    if (msg.type === 'SNAPGRAB_STATE') {
      recording = msg.recording;
      if (recording?.active) showPill(msg.count || 0);
      else hidePill();
    }
    if (msg.type === 'SNAPGRAB_STEP_ADDED' && recording?.active) {
      clearTimeout(preCaptureTimer);
      if (host) host.style.visibility = '';
      showPill(msg.count);
    }
    // Keep the recording pill/ring out of the actual screenshot pixels.
    if (msg.type === 'SNAPGRAB_HIDE_OVERLAY') {
      if (host) host.style.visibility = 'hidden';
      sendResponse({ ok: true });
      return;
    }
    if (msg.type === 'SNAPGRAB_SHOW_OVERLAY') {
      clearTimeout(preCaptureTimer);
      if (host) host.style.visibility = '';
      sendResponse({ ok: true });
      return;
    }
  });

  chrome.runtime
    .sendMessage({ type: 'SNAPGRAB_HELLO' })
    .then((res) => {
      if (res?.recording) {
        recording = res.recording;
        if (recording.active) showPill(res.count || 0);
      }
    })
    .catch(() => {});
})();
