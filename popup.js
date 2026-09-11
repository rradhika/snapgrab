const idleEl = document.getElementById('idle');
const activeEl = document.getElementById('active');
const countEl = document.getElementById('count');
const resumeBox = document.getElementById('resumeBox');
const resumeCount = document.getElementById('resumeCount');

async function refresh() {
  const state = await chrome.runtime.sendMessage({ type: 'SNAPGRAB_GET_STATE' });
  if (state.active) {
    idleEl.classList.add('hidden');
    activeEl.classList.remove('hidden');
    countEl.textContent = state.count;
  } else {
    activeEl.classList.add('hidden');
    idleEl.classList.remove('hidden');
    if (state.count > 0) {
      resumeBox.classList.remove('hidden');
      resumeCount.textContent = state.count;
    } else {
      resumeBox.classList.add('hidden');
    }
  }
}

document.getElementById('startBtn').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'SNAPGRAB_START' });
  window.close();
});

document.getElementById('stopBtn').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'SNAPGRAB_STOP' });
  window.close();
});

document.getElementById('discardBtn').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'SNAPGRAB_STOP', discard: true });
  window.close();
});

document.getElementById('resumeBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('editor.html') });
  window.close();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SNAPGRAB_POPUP_UPDATE' && !activeEl.classList.contains('hidden')) {
    countEl.textContent = msg.count;
  }
});

refresh();
