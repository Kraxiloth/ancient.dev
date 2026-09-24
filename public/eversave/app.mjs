import { inspect } from './parser.mjs';
const $ = id => document.getElementById(id);
const input = $('file'), panel = document.querySelector('.open-panel');
const status = $('status');
const setText = (parent, tag, value, className) => {
  const node = document.createElement(tag); node.textContent = value;
  if (className) node.className = className;
  parent.append(node); return node;
};
function duration(seconds) {
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60);
  return `${new Intl.NumberFormat().format(hours)}h ${String(minutes).padStart(2, '0')}m`;
}
function render(file, save) {
  $('results').hidden = false;
  $('count').textContent = `${save.activeCount} / 10 occupied`;
  const meta = $('file-meta'); meta.replaceChildren();
  [['FILE', file.name], ['SIZE', `${(save.fileBytes / 1048576).toFixed(1)} MiB`],
    ['ACCOUNT ID', save.steamId], ['FORMAT', 'PC / BND4']].forEach(([label, value]) => {
      const item = setText(meta, 'div', '', 'meta-item'); setText(item, 'span', label); setText(item, 'strong', value);
    });
  const warnings = $('warnings'); warnings.replaceChildren();
  if (save.warnings.length) { warnings.hidden = false; save.warnings.forEach(w => setText(warnings, 'p', w)); }
  else warnings.hidden = true;
  const slots = $('slots'); slots.replaceChildren();
  save.slots.forEach(slot => {
    const card = setText(slots, 'article', '', `slot ${slot.active ? 'occupied' : 'empty'}`);
    const top = setText(card, 'div', '', 'slot-top');
    setText(top, 'span', `SLOT ${String(slot.index).padStart(2, '0')}`, 'slot-index');
    setText(top, 'span', slot.active ? (slot.issues.length ? 'REVIEW' : 'OCCUPIED') : (slot.issues.length ? 'REVIEW' : 'EMPTY'), 'slot-state');
    setText(card, 'h3', slot.active ? slot.name || 'Name unavailable' : 'Empty slot');
    if (slot.active) {
      const details = setText(card, 'div', '', 'details');
      setText(details, 'span', `LEVEL ${slot.level ?? '—'}`);
      setText(details, 'span', `PLAY TIME ${duration(slot.seconds ?? 0)}`);
    } else setText(card, 'p', 'No active character in this position.', 'empty-caption');
    slot.issues.forEach(issue => setText(card, 'p', issue, 'issue'));
  });
  status.textContent = `Read ${file.name} locally. No data was uploaded or saved.`;
}
async function open(file) {
  if (!file) return;
  $('results').hidden = true;
  if (!/\.sl2$/i.test(file.name)) { status.textContent = 'Choose an Elden Ring .sl2 file.'; return; }
  status.textContent = 'Reading local file…';
  try { const buffer = await file.arrayBuffer(); render(file, inspect(buffer)); }
  catch (error) { status.textContent = error instanceof Error ? error.message : 'Could not read this file.'; }
  finally { input.value = ''; }
}
input.addEventListener('change', () => open(input.files?.[0]));
for (const type of ['dragenter', 'dragover']) panel.addEventListener(type, event => { event.preventDefault(); panel.classList.add('dragging'); });
for (const type of ['dragleave', 'drop']) panel.addEventListener(type, event => { event.preventDefault(); panel.classList.remove('dragging'); });
panel.addEventListener('drop', event => open(event.dataTransfer?.files?.[0]));
