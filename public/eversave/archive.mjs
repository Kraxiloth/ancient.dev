import { md5 } from './md5.mjs';
import { HEADER, PROFILE_START, PROFILE_SIZE, SLOT_DATA, SLOT_SPAN } from './parser.mjs';

// EverSave character archive v1. This format is for archival only, not a game save.
// 8-byte magic, u32 LE metadata/slot/profile lengths, UTF-8 JSON metadata,
// complete PC slot (MD5 + data), profile summary entry, MD5 over all preceding bytes.
const MAGIC = new TextEncoder().encode('EVCHAR01');
const SLOT_LENGTH = SLOT_DATA + 16;
const FOOTER_LENGTH = 16;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const same = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
const fail = message => { throw new Error(message); };

export function createCharacterArchive(buffer, save, slotNumber, label) {
  const slot = save.slots[slotNumber - 1];
  if (!slot?.active || slot.checksum !== 'valid' || slot.issues.length || save.accountChecksum !== 'valid')
    fail('Only a valid occupied slot from a save with a valid account checksum can be archived.');
  const name = String(label || slot.name).trim().slice(0, 80);
  if (!name) fail('Give the archive a label.');
  const metadata = { format: 'EverSave character archive', version: 1, label: name,
    characterName: slot.name, level: slot.level, secondsPlayed: slot.seconds,
    sourceSlot: slotNumber, accountId: save.steamId, createdAt: new Date().toISOString() };
  const json = encoder.encode(JSON.stringify(metadata));
  const start = HEADER + (slotNumber - 1) * SLOT_SPAN;
  const profile = PROFILE_START + (slotNumber - 1) * PROFILE_SIZE;
  const slotBytes = new Uint8Array(buffer, start, SLOT_LENGTH);
  const profileBytes = new Uint8Array(buffer, profile, PROFILE_SIZE);
  const size = 20 + json.length + SLOT_LENGTH + PROFILE_SIZE + FOOTER_LENGTH;
  const result = new Uint8Array(size), view = new DataView(result.buffer);
  result.set(MAGIC);
  view.setUint32(8, json.length, true);
  view.setUint32(12, SLOT_LENGTH, true);
  view.setUint32(16, PROFILE_SIZE, true);
  let offset = 20;
  result.set(json, offset); offset += json.length;
  result.set(slotBytes, offset); offset += SLOT_LENGTH;
  result.set(profileBytes, offset); offset += PROFILE_SIZE;
  result.set(md5(result.subarray(0, offset)), offset);
  return { buffer: result.buffer, metadata };
}

export function readCharacterArchive(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 20 + FOOTER_LENGTH || !same(bytes.subarray(0, 8), MAGIC))
    fail('This is not an EverSave .erchar archive.');
  const view = new DataView(buffer);
  const jsonLength = view.getUint32(8, true), slotLength = view.getUint32(12, true);
  const profileLength = view.getUint32(16, true);
  if (jsonLength < 2 || jsonLength > 4096 || slotLength !== SLOT_LENGTH || profileLength !== PROFILE_SIZE ||
      bytes.length !== 20 + jsonLength + slotLength + profileLength + FOOTER_LENGTH)
    fail('The archive has unsupported or incomplete section lengths.');
  const footerOffset = bytes.length - FOOTER_LENGTH;
  if (!same(bytes.subarray(footerOffset), md5(bytes.subarray(0, footerOffset))))
    fail('The archive integrity check failed.');
  let metadata;
  try { metadata = JSON.parse(decoder.decode(bytes.subarray(20, 20 + jsonLength))); }
  catch { fail('The archive metadata cannot be read.'); }
  if (metadata?.format !== 'EverSave character archive' || metadata.version !== 1 ||
      !Number.isInteger(metadata.sourceSlot) || metadata.sourceSlot < 1 || metadata.sourceSlot > 10 ||
      !Number.isInteger(metadata.level) || metadata.level < 1 || metadata.level > 713 ||
      !Number.isInteger(metadata.secondsPlayed) || metadata.secondsPlayed < 0 ||
      typeof metadata.label !== 'string' || !metadata.label.trim() || metadata.label.length > 80 ||
      typeof metadata.characterName !== 'string' || !metadata.characterName.trim() ||
      typeof metadata.accountId !== 'string' || !/^\d{1,20}$/.test(metadata.accountId) ||
      typeof metadata.createdAt !== 'string' || !Number.isFinite(Date.parse(metadata.createdAt)))
    fail('The archive metadata is unsupported or invalid.');
  const slotOffset = 20 + jsonLength;
  const slot = bytes.subarray(slotOffset, slotOffset + slotLength);
  if (!same(slot.subarray(0, 16), md5(slot.subarray(16))))
    fail('The saved character slot checksum does not match its data.');
  const profile = bytes.subarray(slotOffset + slotLength, footerOffset);
  const profileView = new DataView(profile.buffer, profile.byteOffset, profile.length);
  const savedName = new TextDecoder('utf-16le').decode(profile.subarray(0, 32)).split('\0')[0].trim();
  if (savedName !== metadata.characterName || profileView.getUint32(34, true) !== metadata.level ||
      profileView.getUint32(38, true) !== metadata.secondsPlayed)
    fail('The archive summary does not match its metadata.');
  return metadata;
}

const DB_NAME = 'eversave-character-library';
const DB_VERSION = 1;
function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) { reject(new Error('Browser storage is unavailable. Use .erchar export instead.')); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('entries', { keyPath: 'id' });
      db.createObjectStore('archives');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open browser storage.'));
  });
}
function transaction(db, mode, work) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['entries', 'archives'], mode);
    let value;
    tx.oncomplete = () => { db.close(); resolve(value); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Browser storage failed.')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Browser storage was interrupted.')); };
    work(tx, result => { value = result; });
  });
}
export async function storeArchive(buffer) {
  const metadata = readCharacterArchive(buffer);
  const id = crypto.randomUUID();
  const db = await openDatabase();
  await transaction(db, 'readwrite', tx => {
    tx.objectStore('entries').put({ id, ...metadata });
    tx.objectStore('archives').put(buffer, id);
  });
  return id;
}
export async function listArchives() {
  const db = await openDatabase();
  return transaction(db, 'readonly', (tx, done) => {
    const request = tx.objectStore('entries').getAll();
    request.onsuccess = () => done(request.result.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  });
}
export async function getArchive(id) {
  const db = await openDatabase();
  const value = await transaction(db, 'readonly', (tx, done) => {
    const request = tx.objectStore('archives').get(id);
    request.onsuccess = () => done(request.result);
  });
  if (!value) fail('That archive is no longer in this browser.');
  readCharacterArchive(value);
  return value;
}
export async function deleteArchive(id) {
  const db = await openDatabase();
  return transaction(db, 'readwrite', tx => {
    tx.objectStore('entries').delete(id);
    tx.objectStore('archives').delete(id);
  });
}
