import { md5 } from './md5.mjs';
import { extractCharacterArchive } from './archive.mjs';
import { inspect, HEADER, SLOT_SPAN, ACCOUNT, ACCOUNT_DATA, PROFILE_FLAGS, PROFILE_START, PROFILE_SIZE } from './parser.mjs';

const equal = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
const fail = message => { throw new Error(message); };

export function generateRestoredSave(originalBuffer, archiveBuffer, destinationSlot) {
  if (!Number.isInteger(destinationSlot) || destinationSlot < 1 || destinationSlot > 10)
    fail('Choose a destination slot from 1 to 10.');
  const original = inspect(originalBuffer);
  if (original.accountChecksum !== 'valid' || original.warnings.length ||
      original.slots.some(slot => slot.issues.length || (slot.active && slot.checksum !== 'valid')))
    fail('The destination save has checksum or slot warnings. Restoration is disabled for this file.');
  const { metadata, slotBytes, profileBytes } = extractCharacterArchive(archiveBuffer);
  if (metadata.accountId !== original.steamId)
    fail('This character archive belongs to a different account. Cross-account restore is not supported.');
  const archivedVersion = new DataView(slotBytes.buffer, slotBytes.byteOffset + 16, 4).getUint32(0, true);
  // A single save can legitimately contain different character payload versions.
  // Copy the archived slot verbatim; never rewrite or "upgrade" its format.
  if (archivedVersion === 0)
    fail('The archive contains an empty character slot.');
  const before = original.slots[destinationSlot - 1];
  const outputBuffer = originalBuffer.slice(0);
  const output = new Uint8Array(outputBuffer);
  const slotStart = HEADER + (destinationSlot - 1) * SLOT_SPAN;
  const profileStart = PROFILE_START + (destinationSlot - 1) * PROFILE_SIZE;
  output.set(slotBytes, slotStart);
  output.set(profileBytes, profileStart);
  output[PROFILE_FLAGS + destinationSlot - 1] = 1;
  output.set(md5(output.subarray(ACCOUNT_DATA, ACCOUNT_DATA + 0x60000)), ACCOUNT);

  // Restrict every changed byte to the selected slot and its account summary.
  const input = new Uint8Array(originalBuffer);
  const permitted = index =>
    (index >= slotStart && index < slotStart + SLOT_SPAN) ||
    (index >= ACCOUNT && index < ACCOUNT_DATA) ||
    index === PROFILE_FLAGS + destinationSlot - 1 ||
    (index >= profileStart && index < profileStart + PROFILE_SIZE);
  for (let i = 0; i < output.length; i++) {
    if (output[i] !== input[i] && !permitted(i)) fail('Unexpected data changed while generating the restored copy.');
  }
  const result = inspect(outputBuffer);
  const restored = result.slots[destinationSlot - 1];
  if (result.accountChecksum !== 'valid' || result.warnings.length ||
      !restored.active || restored.checksum !== 'valid' || restored.issues.length ||
      restored.name !== metadata.characterName || restored.level !== metadata.level ||
      restored.seconds !== metadata.secondsPlayed || result.steamId !== original.steamId)
    fail('The generated save failed its verification checks.');
  for (let i = 0; i < 10; i++) {
    if (i === destinationSlot - 1) continue;
    const start = HEADER + i * SLOT_SPAN;
    if (!equal(input.subarray(start, start + SLOT_SPAN), output.subarray(start, start + SLOT_SPAN)))
      fail('Another character slot changed unexpectedly.');
  }
  return { buffer: outputBuffer, report: result, previous: before, restored, metadata, archivedVersion };
}
