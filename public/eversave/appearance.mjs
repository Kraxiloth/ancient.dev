import { inspect, ACCOUNT, ACCOUNT_DATA } from './parser.mjs';
import { md5 } from './md5.mjs';

export const FAVORITES_START = ACCOUNT_DATA + 0x154;
export const PRESET_SIZE = 0x130;
export function validatePreset(raw) {
  if (!(raw instanceof Uint8Array) || raw.length !== PRESET_SIZE) throw new Error('An appearance must contain exactly 304 bytes.');
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  if (String.fromCharCode(...raw.subarray(0x18, 0x1c)) !== 'FACE' || view.getUint32(0x1c, true) !== 4 || view.getUint32(0x20, true) !== 0x120)
    throw new Error('This favorite has an unsupported appearance structure.');
  if (raw[9] > 1) throw new Error('Unsupported appearance body type.');
  for (let i = 0x24; i < 0x44; i += 4) if (view.getUint32(i, true) > 255) throw new Error('Unsupported appearance model ID.');
  return raw;
}
export function readFavorites(buffer) {
  const report = inspect(buffer), bytes = new Uint8Array(buffer);
  const favorites = Array.from({ length: 15 }, (_, index) => {
    const raw = bytes.slice(FAVORITES_START + index * PRESET_SIZE, FAVORITES_START + (index + 1) * PRESET_SIZE);
    const signature = String.fromCharCode(...raw.subarray(0x18, 0x1c));
    const empty = signature !== 'FACE' && raw[8] === 0;
    let issue = null;
    if (!empty) try { validatePreset(raw); } catch (e) { issue = e.message; }
    return { slot: index + 1, empty, issue, raw: empty ? null : raw, bodyType: raw[9] === 0 ? 'A' : 'B' };
  });
  return { report, favorites };
}
export async function createAppearance(raw, name = 'Untitled appearance', manualValues = {}) {
  validatePreset(raw);
  const preset = btoa(String.fromCharCode(...raw));
  const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', raw))].map(x => x.toString(16).padStart(2, '0')).join('');
  return { format: 'EverSave appearance', version: 1, name: String(name).slice(0, 80), preset, sha256, manualValues };
}
export async function readAppearance(value) {
  if (!value || value.format !== 'EverSave appearance' || value.version !== 1 || typeof value.preset !== 'string' || value.preset.length !== 408)
    throw new Error('Choose an EverSave .erappearance file.');
  let raw;
  try { raw = Uint8Array.from(atob(value.preset), c => c.charCodeAt(0)); } catch { throw new Error('The appearance data is damaged.'); }
  validatePreset(raw);
  const expected = await createAppearance(raw);
  if (expected.sha256 !== value.sha256) throw new Error('The appearance checksum does not match.');
  if (typeof value.name !== 'string' || value.name.length > 80) throw new Error('Invalid appearance name.');
  const manualValues = value.manualValues || {};
  if (typeof manualValues !== 'object' || Array.isArray(manualValues)) throw new Error('Invalid menu values.');
  const limits = { bone: 6, hair: 37, brow: 17, beard: 12, patch: 4, tattoo: 100, lashes: 4, musculature: 2 };
  for (const [key, number] of Object.entries(manualValues))
    if (!Object.hasOwn(limits, key) || !Number.isInteger(number) || number < 1 || number > limits[key]) throw new Error('Invalid confirmed menu selector.');
  return { archive: { ...expected, name: value.name, manualValues }, raw };
}
export function restoreFavorite(original, raw, slot) {
  validatePreset(raw);
  if (!Number.isInteger(slot) || slot < 1 || slot > 15) throw new Error('Choose a favorite slot from 1 to 15.');
  const before = readFavorites(original);
  if (before.report.accountChecksum !== 'valid' || before.report.warnings.length || before.favorites.some(x => x.issue))
    throw new Error('The save has account or appearance warnings. Import is disabled.');
  const output = original.slice(0), bytes = new Uint8Array(output), input = new Uint8Array(original);
  const start = FAVORITES_START + (slot - 1) * PRESET_SIZE;
  bytes.set(raw, start);
  bytes.set(md5(bytes.subarray(ACCOUNT_DATA, ACCOUNT_DATA + 0x60000)), ACCOUNT);
  for (let i = 0; i < bytes.length; i++)
    if (bytes[i] !== input[i] && !(i >= start && i < start + PRESET_SIZE) && !(i >= ACCOUNT && i < ACCOUNT_DATA))
      throw new Error('Unexpected data changed outside the chosen favorite.');
  const after = readFavorites(output);
  if (after.report.accountChecksum !== 'valid' || after.favorites[slot - 1].issue || after.favorites[slot - 1].empty)
    throw new Error('The updated save failed verification.');
  return output;
}
