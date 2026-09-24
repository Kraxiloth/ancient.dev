# EverSave 0.4.3

Static, client-side Elden Ring PC save inspector and character archivist.
Serve `public/` at the site root and open `/eversave/`. The page uses ES modules,
IndexedDB, and browser downloads. Hosting over HTTPS is recommended. No server
endpoint receives save data.

## Features

- Read an unencrypted PC BND4 `.sl2` file and inspect ten slots.
- Verify MD5 checksums of occupied slots and the account section.
- Download an unchanged copy of the selected full `.sl2` save.
- Store individual character archives in this browser's IndexedDB.
- Export and import `.erchar` archives for portable backups.
- Generate a new `.sl2` with one selected character slot restored, limited to the same account.
- No direct access to or modification of the game's save folder.

Browser storage is convenient but can be cleared. Export archives as files for
long-term keeping. A valid checksum does not guarantee that the game will accept
a save. The original file is never modified. Restore generation copies the complete save,
replaces one slot and its account profile summary, marks it active, recalculates
the account MD5, and verifies the result. Every changed byte must be within
those specified regions. Cross-account restoration is blocked. Character payload versions can vary among slots within the same save, so EverSave preserves the archived slot bytes without converting its version. After generation,
click the explicit download link, then re-open the file in EverSave and compare
its slot list with the original. Restored downloads use the game filename
`ER0000.sl2`; keep the original under a different name and outside the game's
save location before replacing it. A user confirmed that one restored save
appears on the Load Game screen in Elden Ring 1.17. Broader compatibility is
not established.

## `.erchar` v1 binary layout

All integer fields are little-endian. The format is for EverSave archives, not
for direct use by the game.

| Offset | Size | Content |
| --- | ---: | --- |
| 0 | 8 | ASCII `EVCHAR01` |
| 8 | 4 | UTF-8 JSON metadata length |
| 12 | 4 | Complete PC slot length, `0x280010` |
| 16 | 4 | Profile summary length, `0x24C` |
| 20 | Variable | JSON: label, character name, level, play time, source slot, account ID, timestamp, format/version |
| After JSON | `0x280010` | 16-byte stored slot MD5 followed by `0x280000` slot data bytes |
| After slot | `0x24C` | Corresponding account profile summary entry |
| Last 16 | 16 | MD5 over all preceding archive bytes |

On import, EverSave checks the archive length, metadata, whole archive digest,
slot digest, and consistency of the profile summary fields. MD5 detects
accidental damage here; it does not authenticate who created a file.

Implementation references:
- https://github.com/oisis/EldenRing-SaveForge/blob/main/spec/01-header.md
- https://github.com/Hapfel1/er-save-manager/blob/main/src/er_save_manager/parser/user_data_10.py

Restore structure reference: https://github.com/Hapfel1/er-save-manager/blob/main/src/er_save_manager/transfer/character_ops.py
