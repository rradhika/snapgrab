let steps = [];
let meta = { title: 'Untitled Guide' };
let dragSrc = null;

const stepsEl = document.getElementById('steps');
const emptyEl = document.getElementById('empty');
const titleInput = document.getElementById('docTitle');

async function load() {
  const data = await chrome.storage.local.get(['snapgrab_steps', 'snapgrab_meta']);
  steps = data.snapgrab_steps || [];
  meta = data.snapgrab_meta || { title: 'Untitled Guide' };
  titleInput.value = meta.title || 'Untitled Guide';
  render();
}

async function persistSteps() {
  await chrome.storage.local.set({ snapgrab_steps: steps });
}

async function persistMeta() {
  await chrome.storage.local.set({ snapgrab_meta: meta });
}

function escapeHtml(s = '') {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function addDragHandlers(card) {
  card.addEventListener('dragstart', () => {
    dragSrc = Number(card.dataset.index);
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));
  card.addEventListener('dragover', (e) => e.preventDefault());
  card.addEventListener('drop', () => {
    const target = Number(card.dataset.index);
    if (dragSrc === null || dragSrc === target) return;
    const [moved] = steps.splice(dragSrc, 1);
    steps.splice(target, 0, moved);
    dragSrc = null;
    persistSteps();
    render();
  });
}

// Built with DOM APIs (not innerHTML) so captured page text can never inject markup into this page.
function render() {
  stepsEl.innerHTML = '';
  emptyEl.classList.toggle('hidden', steps.length > 0);

  steps.forEach((step, i) => {
    const card = document.createElement('section');
    card.className = 'card';
    card.draggable = true;
    card.dataset.index = String(i);

    const head = document.createElement('div');
    head.className = 'card-head';

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = String(i + 1);

    const titleField = document.createElement('input');
    titleField.className = 'step-title';
    titleField.value = step.title || '';
    titleField.addEventListener('input', (e) => {
      steps[i].title = e.target.value;
      persistSteps();
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn delete';
    delBtn.title = 'Delete step';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => {
      steps.splice(i, 1);
      persistSteps();
      render();
    });

    head.append(badge, titleField, delBtn);

    const img = document.createElement('img');
    img.className = 'shot';
    img.src = step.screenshot;
    img.alt = `Step ${i + 1} screenshot`;
    img.addEventListener('click', () => window.open(step.screenshot, '_blank'));

    const desc = document.createElement('textarea');
    desc.className = 'step-desc';
    desc.placeholder = 'Add extra notes for this step…';
    desc.value = step.description || '';
    desc.addEventListener('input', (e) => {
      steps[i].description = e.target.value;
      persistSteps();
    });

    card.append(head, img, desc);
    addDragHandlers(card);
    stepsEl.appendChild(card);
  });
}

titleInput.addEventListener('input', () => {
  meta.title = titleInput.value;
  persistMeta();
});

document.getElementById('clearBtn').addEventListener('click', async () => {
  if (!confirm('Clear all steps in this guide? This cannot be undone.')) return;
  steps = [];
  await persistSteps();
  render();
});

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function fileBaseName() {
  return (meta.title || 'guide').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'guide';
}

function buildHtmlDoc() {
  const title = escapeHtml(meta.title || 'Untitled Guide');
  const body = steps
    .map((s, i) => `
    <section style="margin:0 0 40px;">
      <h2 style="font:600 18px/1.4 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111827;">${i + 1}. ${escapeHtml(s.title)}</h2>
      ${s.description ? `<p style="color:#374151;font:14px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif;">${escapeHtml(s.description)}</p>` : ''}
      <img src="${s.screenshot}" style="max-width:100%;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.08);" />
    </section>`)
    .join('\n');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="max-width:860px;margin:40px auto;padding:0 20px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
<h1 style="font-size:28px;color:#111827;">${title}</h1>
${body}
</body></html>`;
}

function buildMarkdown() {
  const title = meta.title || 'Untitled Guide';
  const lines = [`# ${title}`, ''];
  steps.forEach((s, i) => {
    lines.push(`## ${i + 1}. ${s.title}`);
    if (s.description) lines.push('', s.description);
    lines.push('', `![Step ${i + 1}](${s.screenshot})`, '');
  });
  return lines.join('\n');
}

document.getElementById('exportHtml').addEventListener('click', () => {
  downloadFile(`${fileBaseName()}.html`, buildHtmlDoc(), 'text/html');
});

document.getElementById('exportMd').addEventListener('click', () => {
  downloadFile(`${fileBaseName()}.md`, buildMarkdown(), 'text/markdown');
});

document.getElementById('printBtn').addEventListener('click', () => {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(buildHtmlDoc());
  w.document.close();
  setTimeout(() => w.print(), 300);
});

load();
