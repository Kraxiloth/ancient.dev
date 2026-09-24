import { inspect } from './parser.mjs';
import { generateRestoredSave } from './restore.mjs';
import { createCharacterArchive, readCharacterArchive, storeArchive, listArchives, getArchive, deleteArchive } from './archive.mjs';
const $ = id => document.getElementById(id);
const input = $('file'), panel = document.querySelector('.open-panel');
const status = $('status'), libraryStatus = $('library-status');
let currentFile = null, currentBuffer = null, currentSave = null, pendingArchive = null;
const setText = (parent, tag, value, className) => {
  const node = document.createElement(tag); node.textContent = value;
  if (className) node.className = className;
  parent.append(node); return node;
};
function duration(seconds) {
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60);
  return `${new Intl.NumberFormat().format(hours)}h ${String(minutes).padStart(2, '0')}m`;
}
function filename(name) {
  return (name.normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'character');
}
function download(data, name, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function button(parent, label, action, disabled = false) {
  const element = setText(parent, 'button', label, 'action-button');
  element.type = 'button'; element.disabled = disabled;
  element.addEventListener('click', async () => {
    element.disabled = true;
    try { await action(); }
    catch (error) { const message = error instanceof Error ? error.message : 'The action failed.'; status.textContent = message; if (label === 'Prepare restore') libraryStatus.textContent = message; }
    finally { element.disabled = disabled; }
  });
  return element;
}
function makeArchive(slot, label) {
  if (!currentBuffer || !currentSave) throw new Error('Open a save file first.');
  return createCharacterArchive(currentBuffer, currentSave, slot.index, label);
}
function render(file, save) {
  $('results').hidden = false;
  $('count').textContent = `${save.activeCount} / 10 occupied`;
  const meta = $('file-meta'); meta.replaceChildren();
  [['FILE', file.name], ['SIZE', `${(save.fileBytes / 1048576).toFixed(1)} MiB`],
    ['ACCOUNT ID', save.steamId], ['ACCOUNT CHECKSUM', save.accountChecksum === 'valid' ? 'Valid' : save.accountChecksum === 'absent' ? 'Absent' : 'Mismatch'], ['FORMAT', 'PC / BND4']].forEach(([label, value]) => {
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
      setText(card, 'p', `CHECKSUM ${slot.checksum === 'valid' ? 'VALID' : slot.checksum === 'absent' ? 'ABSENT' : 'MISMATCH'}`, `checksum ${slot.checksum}`);
      const actions = setText(card, 'div', '', 'slot-actions');
      const eligible = slot.checksum === 'valid' && !slot.issues.length && save.accountChecksum === 'valid';
      button(actions, 'Archive in browser', async () => {
        const label = prompt('Label this character archive:', slot.name);
        if (label === null) return;
        const { buffer } = makeArchive(slot, label);
        await storeArchive(buffer); await renderLibrary();
        status.textContent = `${slot.name} was archived in this browser. Export an .erchar copy for safekeeping.`;
      }, !eligible);
      button(actions, 'Export .erchar', () => {
        const { buffer } = makeArchive(slot, slot.name);
        download(buffer, `${filename(slot.name)}-slot-${String(slot.index).padStart(2, '0')}.erchar`);
        status.textContent = `Exported ${slot.name} as an .erchar archive.`;
      }, !eligible);
      if (!eligible) setText(card, 'p', 'Archiving requires a valid slot and account checksum with no review warnings.', 'archive-note');
    } else setText(card, 'p', 'No active character in this position.', 'empty-caption');
    slot.issues.forEach(issue => setText(card, 'p', issue, 'issue'));
  });
  $('backup').hidden = false;
  status.textContent = `Read ${file.name} locally. No data was uploaded or saved.`;
}
async function open(file) {
  if (!file) return;
  currentFile = currentBuffer = currentSave = pendingArchive = null;
  $('restore-panel').hidden = true;
  $('results').hidden = true; $('backup').hidden = true;
  if (!/\.sl2$/i.test(file.name)) { status.textContent = 'Choose an Elden Ring .sl2 file.'; return; }
  status.textContent = 'Reading and checking local file…';
  try {
    const buffer = await file.arrayBuffer();
    const save = inspect(buffer);
    currentFile = file; currentBuffer = buffer; currentSave = save;
    render(file, save);
  } catch (error) { status.textContent = error instanceof Error ? error.message : 'Could not read this file.'; }
  finally { input.value = ''; }
}
async function renderLibrary() {
  const container = $('archive-list'); container.replaceChildren();
  try {
    const entries = await listArchives();
    libraryStatus.textContent = entries.length ? `${entries.length} character archive${entries.length === 1 ? '' : 's'} stored in this browser.` : 'No character archives in this browser yet.';
    for (const entry of entries) {
      const card = setText(container, 'article', '', 'archive-entry');
      const info = setText(card, 'div', '', 'archive-info');
      setText(info, 'strong', entry.label);
      setText(info, 'span', `${entry.characterName} · Level ${entry.level} · Slot ${String(entry.sourceSlot).padStart(2, '0')} · ${new Date(entry.createdAt).toLocaleString()}`);
      const actions = setText(card, 'div', '', 'archive-actions');
      button(actions, 'Export .erchar', async () => {
        const buffer = await getArchive(entry.id);
        download(buffer, `${filename(entry.label)}-${entry.createdAt.slice(0, 10)}.erchar`);
        libraryStatus.textContent = `Exported ${entry.label}.`;
      });
      button(actions, 'Prepare restore', async () => {
        if (!currentSave) throw new Error('Open a destination .sl2 save first, then select this archive.');
        const buffer = await getArchive(entry.id);
        const metadata = readCharacterArchive(buffer);
        if (metadata.accountId !== currentSave.steamId) throw new Error('The archive account ID differs from the opened save.');
        pendingArchive = buffer;
        $('restore-source').textContent = `${metadata.characterName} · Level ${metadata.level} · Archived from slot ${String(metadata.sourceSlot).padStart(2, '0')}`;
        const target = $('restore-target'); target.replaceChildren();
        currentSave.slots.forEach(slot => {
          const option = document.createElement('option');
          option.value = slot.index;
          option.textContent = `Slot ${String(slot.index).padStart(2, '0')} - ${slot.active ? slot.name || 'Unnamed' : 'Empty'}`;
          target.append(option);
        });
        target.value = String(metadata.sourceSlot);
        $('restore-ack').checked = false;
        updateRestorePreview();
        $('restore-feedback').textContent = '';
        $('restore-panel').hidden = false;
        $('restore-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      button(actions, 'Delete', async () => {
        if (!confirm(`Delete "${entry.label}" from this browser? Export it first if you want to keep a copy.`)) return;
        await deleteArchive(entry.id); await renderLibrary();
      });
    }
  } catch (error) {
    libraryStatus.textContent = error instanceof Error ? error.message : 'Could not read browser archives.';
  }
}
function updateRestorePreview() {
  if (!currentSave || !pendingArchive) return;
  const slot = currentSave.slots[Number($('restore-target').value) - 1];
  const metadata = readCharacterArchive(pendingArchive);
  $('restore-preview').textContent = slot.active
    ? `Slot ${String(slot.index).padStart(2, '0')} currently contains ${slot.name} (level ${slot.level}). The downloaded copy will contain ${metadata.characterName} (level ${metadata.level}) there.`
    : `Slot ${String(slot.index).padStart(2, '0')} is empty. The downloaded copy will contain ${metadata.characterName} (level ${metadata.level}) there.`;
  $('restore-download').disabled = !$('restore-ack').checked;
}
$('restore-target').addEventListener('change', () => { $('restore-ack').checked = false; updateRestorePreview(); });
$('restore-ack').addEventListener('change', updateRestorePreview);
$('restore-download').addEventListener('click', () => {
  if (!currentBuffer || !pendingArchive || !$('restore-ack').checked) return;
  const slot = Number($('restore-target').value);
  const previous = currentSave.slots[slot - 1];
  const message = `Generate a NEW .sl2 copy with slot ${String(slot).padStart(2, '0')} replaced?${previous.active ? ` The copy will replace ${previous.name} in that slot.` : ''} Your opened file will not be changed.`;
  if (!confirm(message)) return;
  const control = $('restore-download'); control.disabled = true;
  try {
    const result = generateRestoredSave(currentBuffer, pendingArchive, slot);
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    download(result.buffer, `${currentFile.name.replace(/\.sl2$/i, '')}.eversave-restored-${stamp}.sl2`);
    status.textContent = `Generated and checked a new save with ${result.restored.name} in slot ${String(slot).padStart(2, '0')}. Re-open the downloaded copy here to inspect it.`;
    $('restore-feedback').textContent = status.textContent;
  } catch (error) { status.textContent = error instanceof Error ? error.message : 'Restore generation failed.'; $('restore-feedback').textContent = status.textContent; }
  finally { control.disabled = false; }
});
input.addEventListener('change', () => open(input.files?.[0]));
for (const type of ['dragenter', 'dragover']) panel.addEventListener(type, event => { event.preventDefault(); panel.classList.add('dragging'); });
for (const type of ['dragleave', 'drop']) panel.addEventListener(type, event => { event.preventDefault(); panel.classList.remove('dragging'); });
panel.addEventListener('drop', event => open(event.dataTransfer?.files?.[0]));
$('backup').addEventListener('click', () => {
  if (!currentFile) return;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  download(currentFile, `${currentFile.name.replace(/\.sl2$/i, '')}.eversave-${stamp}.sl2`);
  status.textContent = 'Downloaded an unchanged copy of the selected .sl2 file.';
});
$('import-file').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    if (!/\.erchar$/i.test(file.name) || file.size > 4 * 1024 * 1024) throw new Error('Choose an .erchar archive smaller than 4 MiB.');
    const buffer = await file.arrayBuffer();
    const metadata = readCharacterArchive(buffer);
    await storeArchive(buffer); await renderLibrary();
    libraryStatus.textContent = `Imported ${metadata.label} into this browser.`;
  } catch (error) { libraryStatus.textContent = error instanceof Error ? error.message : 'Import failed.'; }
  finally { $('import-file').value = ''; }
});
renderLibrary();
