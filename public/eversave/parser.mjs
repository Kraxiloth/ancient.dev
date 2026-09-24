import { md5 } from './md5.mjs';
// Read-only Elden Ring PC save inspector. No mutation or file persistence.
export const HEADER = 0x300;
export const SLOT_DATA = 0x280000;
export const SLOT_SPAN = SLOT_DATA + 0x10;
export const ACCOUNT = HEADER + 10 * SLOT_SPAN;
export const ACCOUNT_DATA = ACCOUNT + 0x10;
export const PROFILE_FLAGS = ACCOUNT_DATA + 4 + 8 + 0x140 + 0x1808;
export const PROFILE_START = PROFILE_FLAGS + 10;
export const PROFILE_SIZE = 0x24c;
const decoder = new TextDecoder('utf-16le', { fatal: true });
const zero = bytes => bytes.every(x => x === 0);
const hex = bytes => Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
const matches = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
const checksumStatus = (bytes, checksumOffset, dataOffset, dataLength) => {
  const stored = bytes.subarray(checksumOffset, dataOffset);
  if (zero(stored)) return 'absent';
  return matches(stored, md5(bytes.subarray(dataOffset, dataOffset + dataLength))) ? 'valid' : 'mismatch';
};

export function inspect(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const fail = message => { throw new Error(message); };
  if (bytes.length < 4) fail('The file is too small to contain an Elden Ring save.');
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  if (magic !== 'BND4') fail('Unsupported save container. EverSave currently reads unencrypted PC BND4 .sl2 files only.');
  if (bytes.length < PROFILE_START + 10 * PROFILE_SIZE) fail('The save is truncated before the character summary.');
  if (bytes.length < ACCOUNT_DATA + 0x60000) fail('The save is truncated before the account section ends.');
  const accountVersion = view.getUint32(ACCOUNT_DATA, true);
  const steamId = view.getBigUint64(ACCOUNT_DATA + 4, true).toString();
  const warnings = [];
  const accountChecksum = checksumStatus(bytes, ACCOUNT, ACCOUNT_DATA, 0x60000);
  if (accountChecksum !== 'valid') warnings.push(accountChecksum === 'absent'
    ? 'Account section has no stored checksum.' : 'Account section checksum does not match its data.');
  if (accountVersion === 0) warnings.push('Account section has a zero version. Its profile summary may not be reliable.');
  const slots = [];
  for (let i = 0; i < 10; i++) {
    const checksumOffset = HEADER + i * SLOT_SPAN;
    const dataOffset = checksumOffset + 0x10;
    const profile = PROFILE_START + i * PROFILE_SIZE;
    const activeByte = bytes[PROFILE_FLAGS + i];
    const version = view.getUint32(dataOffset, true);
    const checksum = checksumStatus(bytes, checksumOffset, dataOffset, SLOT_DATA);
    const checksumPresent = checksum !== 'absent';
    const active = activeByte === 1;
    let name = null, level = null, seconds = null;
    const issues = [];
    if (activeByte !== 0 && activeByte !== 1) issues.push('Unrecognized active flag.');
    if (active && version === 0) issues.push('Marked active, but slot version is zero.');
    if (active && !checksumPresent) issues.push('Marked active, but checksum is all zeros.');
    if (checksum === 'mismatch') issues.push('Slot checksum does not match its data.');
    // Deleted characters can leave checksum-valid bytes in an inactive slot.
    // The account profile flag determines whether that slot is occupied.
    if (active) {
      const raw = bytes.subarray(profile, profile + 32);
      try { name = decoder.decode(raw).split('\0')[0].trim() || null; }
      catch { issues.push('Character name could not be decoded.'); }
      level = view.getUint32(profile + 34, true);
      seconds = view.getUint32(profile + 38, true);
      if (!name) issues.push('Character name is missing.');
      if (level < 1 || level > 713) issues.push('Character level is outside the expected 1-713 range.');
    }
    slots.push({ index: i + 1, active, name, level, seconds, version,
      checksumPresent, checksum, storedChecksum: hex(bytes.subarray(checksumOffset, dataOffset)), issues });
  }
  return { fileBytes: bytes.length, accountVersion, steamId, accountChecksum, slots, warnings,
    activeCount: slots.filter(s => s.active).length };
}
