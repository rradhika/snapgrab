// background.js — service worker: owns recording state, screenshot capture/annotation, and storage.

const state = {
  active: false,
  tabId: null,
  windowId: null,
  justStarted: false,
};

async function getSteps() {
  const { snapgrab_steps = [] } = await chrome.storage.local.get('snapgrab_steps');
  return snapgrab_steps;
}

async function setSteps(steps) {
  await chrome.storage.local.set({ snapgrab_steps: steps });
}

async function blobToDataURL(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

// Draws a numbered red marker on the screenshot at the click location (like Scribe's annotations).
async function annotate(dataUrl, x, y, dpr, stepNumber) {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);

    const px = x * dpr;
    const py = y * dpr;

    ctx.beginPath();
    ctx.arc(px, py, 20 * dpr, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,59,48,0.95)';
    ctx.lineWidth = 4 * dpr;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(px, py, 11 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = '#ff3b30';
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${12 * dpr}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(stepNumber), px, py + 1 * dpr);

    const out = await canvas.convertToBlob({ type: 'image/png' });
    return await blobToDataURL(out);
  } catch (e) {
    console.warn('SnapGrab: annotation failed, using raw screenshot', e);
    return dataUrl;
  }
}

async function notifyTab(tabId, msg) {
  if (!tabId) return;
  try {
    await chrome.tabs.sendMessage(tabId, msg);
  } catch (e) {
    // Tab may not have a content script (e.g. chrome:// pages) — safe to ignore.
  }
}

async function broadcastCount(count) {
  await notifyTab(state.tabId, { type: 'SNAPGRAB_STEP_ADDED', count });
  chrome.runtime.sendMessage({ type: 'SNAPGRAB_POPUP_UPDATE', active: state.active, count }).catch(() => {});
}

async function injectIfNeeded(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'SNAPGRAB_PING' });
  } catch (e) {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    } catch (err) {
      console.warn('SnapGrab: could not inject content script on this tab', err);
    }
  }
}

async function startRecording(tab) {
  await setSteps([]);
  state.active = true;
  state.tabId = tab.id;
  state.windowId = tab.windowId;
  state.justStarted = true;

  await chrome.storage.local.set({ snapgrab_meta: { title: tab.title || 'Untitled Guide' } });
  await injectIfNeeded(tab.id);
  await notifyTab(tab.id, { type: 'SNAPGRAB_STATE', recording: { active: true }, count: 0 });
  chrome.runtime.sendMessage({ type: 'SNAPGRAB_POPUP_UPDATE', active: true, count: 0 }).catch(() => {});

  setTimeout(() => { state.justStarted = false; }, 1500);
}

async function stopRecording(opts = {}) {
  const tabId = state.tabId;
  state.active = false;
  await notifyTab(tabId, { type: 'SNAPGRAB_STATE', recording: { active: false }, count: 0 });

  if (opts.discard) {
    await setSteps([]);
  } else {
    const steps = await getSteps();
    if (steps.length > 0) {
      chrome.tabs.create({ url: chrome.runtime.getURL('editor.html') });
    }
  }
  chrome.runtime.sendMessage({ type: 'SNAPGRAB_POPUP_UPDATE', active: false, count: 0 }).catch(() => {});

  state.tabId = null;
  state.windowId = null;
}

async function captureStep(tab, payload) {
  if (!state.active || tab.id !== state.tabId) return;

  await notifyTab(tab.id, { type: 'SNAPGRAB_HIDE_OVERLAY' });
  await new Promise((r) => setTimeout(r, 60)); // let the page repaint without our overlay before screenshotting

  let dataUrl;
  try {
    dataUrl = await chrome.tabs.captureVisibleTab(state.windowId, { format: 'png' });
  } catch (e) {
    console.warn('SnapGrab: screenshot capture failed', e);
    await notifyTab(tab.id, { type: 'SNAPGRAB_SHOW_OVERLAY' });
    return;
  }

  await notifyTab(tab.id, { type: 'SNAPGRAB_SHOW_OVERLAY' });

  const steps = await getSteps();
  const stepNumber = steps.length + 1;

  if (payload.kind === 'click' && typeof payload.x === 'number') {
    dataUrl = await annotate(dataUrl, payload.x, payload.y, payload.dpr || 1, stepNumber);
  }

  steps.push({
    id: crypto.randomUUID(),
    kind: payload.kind,
    title: payload.description,
    description: '',
    screenshot: dataUrl,
    url: tab.url,
    pageTitle: tab.title,
    timestamp: Date.now(),
  });

  await setSteps(steps);
  await broadcastCount(steps.length);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case 'SNAPGRAB_START': {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) await startRecording(tab);
        sendResponse({ ok: true });
        break;
      }
      case 'SNAPGRAB_STOP':
        await stopRecording({ discard: !!msg.discard });
        sendResponse({ ok: true });
        break;
      case 'SNAPGRAB_STOP_CLICK':
        await stopRecording({});
        break;
      case 'SNAPGRAB_GET_STATE': {
        const steps = await getSteps();
        sendResponse({ active: state.active, count: steps.length });
        break;
      }
      case 'SNAPGRAB_CAPTURE':
        if (sender.tab) await captureStep(sender.tab, msg.payload);
        sendResponse({ ok: true });
        break;
      case 'SNAPGRAB_HELLO': {
        const steps = await getSteps();
        const isRecordingTab = !!(sender.tab && sender.tab.id === state.tabId && state.active);
        sendResponse({
          type: 'SNAPGRAB_STATE',
          recording: { active: isRecordingTab },
          count: isRecordingTab ? steps.length : 0,
        });
        break;
      }
      default:
        sendResponse({ ok: false });
    }
  })();
  return true; // keep the message channel open for the async response above
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!state.active || tabId !== state.tabId) return;
  if (changeInfo.status === 'complete' && !state.justStarted) {
    // Small delay so the new page has time to paint before we screenshot it.
    setTimeout(() => {
      captureStep(tab, { kind: 'navigate', description: `Navigated to ${tab.title || tab.url}` });
    }, 400);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (state.active && tabId === state.tabId) stopRecording({ discard: false });
});
