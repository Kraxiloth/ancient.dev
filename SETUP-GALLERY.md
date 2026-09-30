# EverSave 0.5.0 preview - setup

This package contains the existing character tools, the new Appearances tab,
a browsable appearance gallery, and a Cloudflare Worker for submissions and
moderation. The gallery's working title is **Appearance Gallery**. No subdomain
has been chosen or configured, and this package has not been deployed.

## What works locally

- `/eversave/#characters` opens the existing character workspace.
- `/eversave/#appearances` opens the fifteen appearance favorites.
- `.erappearance` exports preserve the complete 304-byte favorite, with a
  SHA-256 digest. The file contains no Steam account ID or character save.
- Preset imports generate a new `ER0000.sl2`; they do not modify the original.
  Only the selected favorite's bytes and the account MD5 may change.
- Sliders are grouped into 24 readable sections, with RGB values and swatches.
- Gallery entries contain up to three screenshots, sliders, a preset, a public
  author name, and a description. Each entry has its own shareable URL.
- Gallery imports open the relevant EverSave tab with the approved preset.
- A pending submission and its images are inaccessible through public APIs.
- Review emails go to **kraxiloth@ancient.dev**. A private link opens a page
  with the screenshots, sliders, and Approve/Deny buttons.
- Approve atomically publishes the whole entry. Deny hides it immediately,
  deletes its images, then deletes its database record. Cleanup failures are
  retried by the hourly job. The page accurately reports pending cleanup.
- Notification failures retain the submission and queue an hourly retry.
- The review link is in the email URL fragment, removed from the address bar
  when loaded, and sent to APIs only in an Authorization header. Reading a
  link never approves or deletes anything. The token stops working after a
  decision. Do not log or share review links.

## Validation and current limits

Automated tests cover binary round trips, digest failures, destination bounds,
changed-byte restrictions, account checksums, private images, review tokens,
publication, full rejection cleanup, retry behavior, origin checks, and
concurrent decisions. Checks on the two previously provided real PC saves
passed, including the 2023 save with fifteen populated favorites.

Desktop and mobile browser checks cover both tabs, the fifteen real favorite
slots, slider rendering, generated-save download, gallery detail views and
deep links, disabled submissions before configuration, and private review.

**A generated favorite import has not yet been tested in Elden Ring.** Use a
separate save backup for the first in-game test. The format remains a preview.
Voice/name and clothing are not stored in an appearance favorite.

The raw favorite is preserved verbatim, including opaque header bytes that
some specifications mistakenly treat as an active/empty integer. Existing
real favorites have pointer-like values there, so these are not rewritten.

Some older model IDs lack a verified conversion to a menu selector number,
and Musculature has not been decoded from the favorite layout.
EverSave displays these as unconfirmed, retaining the raw data for import.
For gallery submission, the author must enter the corresponding number from
the game menu, including Standard/Muscular. These values are marked as author-confirmed; they affect the
manual slider sheet only, not the raw preset. Known hair/model mappings and
the ordinary 0-255 sliders are decoded automatically. A complete current
menu-mapping verification should accompany the first game test.

## Deployment layout

The default URLs are `https://ancient.dev/eversave/` and
`https://ancient.dev/gallery/`. This works before choosing a gallery name.
Once a subdomain is chosen, the frontend and API can move together, retaining
the database and image bucket. `EVERSAVE_URL` specifies the destination of the
Import with EverSave button. The EverSave host must expose the same approved
appearance API, bound to that same database and image bucket.

The original `wrangler.jsonc` is retained. The separate
`wrangler.gallery.example.jsonc` describes the new Worker and required bindings.
Do not replace a production deployment configuration without checking the
existing Pages/Worker routing.

Two supported hosting arrangements:

1. Keep the current static site on Cloudflare Pages. Upload/commit `public/`
   through the existing deployment process. Deploy `gallery-worker.mjs` as a
   Worker and attach a **Worker route** for `ancient.dev/api/*` in the same
   Cloudflare account. Leave the existing Pages domain and root route intact.
   API traffic reaches the Worker; the site and review page remain on Pages.
   Merge the supplied `_headers` into any existing headers file.
2. If Ancient already uses Workers with static assets, integrate the Worker
   handler and bindings into that existing project instead. The example uses
   `ASSETS`, with API routes running through the Worker first.

## Cloudflare resources

Install Wrangler locally, then authenticate with your account:

```sh
npx wrangler login
npx wrangler d1 create eversave-gallery
npx wrangler r2 bucket create eversave-gallery-images
```

Copy `wrangler.gallery.example.jsonc` to `wrangler.gallery.jsonc`. Put the
returned D1 database ID into `database_id`. Keep the R2 bucket private; do not
enable an `r2.dev` public URL or public custom domain. All image reads go
through the Worker, which checks publication status or the review token.

Apply the schema to the new database:

```sh
npx wrangler d1 migrations apply eversave-gallery --remote --config wrangler.gallery.jsonc
```

Create a Turnstile widget in Cloudflare for the actual gallery hostname, then
put its public site key in `TURNSTILE_SITE_KEY`. Add its secret:

```sh
npx wrangler secret put TURNSTILE_SECRET --config wrangler.gallery.jsonc
npx wrangler secret put REVIEW_SECRET --config wrangler.gallery.jsonc
```

For `REVIEW_SECRET`, use a randomly generated value of at least 32 bytes.
Keep it stable; replacing it invalidates outstanding private review links.
Never commit these secrets. Turnstile validation checks the token, hostname,
and `appearance-submit` action before storing a submission.

Set `SITE_ORIGIN` to the exact gallery origin, without a trailing slash. This
origin supplies notification URLs and is the only accepted browser Origin for
submission and review actions. The default is `https://ancient.dev`.

## Email

The forwarder is already set up. Sending notifications requires a separate
Cloudflare Email Service sending configuration:

1. Enable sending for `ancient.dev` and complete sender-domain verification.
2. Allow/verify **kraxiloth@ancient.dev** as a notification recipient as required
   by the sending configuration. Any verification email will follow the existing
   forwarder.
3. Use `notifications@ancient.dev` as `EMAIL_FROM`, or another verified sender
   you choose. The recipient remains **kraxiloth@ancient.dev**.
4. Bind the `EMAIL` send binding with the recipient restriction in the example.

The Worker uses the documented structured `EMAIL.send({from,to,subject,text})`
API. Forwarding alone does not activate outbound sending. If the account does
not yet have this Email Service API enabled, sending must be configured before
launching submissions; the frontend should remain closed until it is ready.

References:
- https://developers.cloudflare.com/email-service/api/send-emails/workers-api/
- https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/
- https://developers.cloudflare.com/r2/api/workers/workers-api-reference/

## Publish and verify

After reviewing the final configuration:

```sh
npx wrangler deploy --config wrangler.gallery.jsonc
```

For Pages hosting, add the API Worker route described above. Upload the static
files through the existing site workflow. Then submit one test appearance,
verify the notification arrives, open its review link, and approve it. Confirm
the gallery and EverSave import link both work. Submit a second entry and deny
it; verify its API and image URLs return 404 and its database row and objects
are gone. Test a generated favorite in-game using a separate backup.

## Development

Node 24 or later is used for the SQLite-backed tests:

```sh
npm test
node tests/dev-server.mjs
```

The local preview runs at `http://127.0.0.1:8787`, with sample entries in an
in-memory database and disabled public submissions. Its fixtures and secrets
are test-only. The optional browser checks use Playwright:

```sh
npm install --no-save playwright
npx playwright install chromium
node tests/browser-qa.mjs
```

Browser checks need the previously provided saves at the paths used by that
script. They are intentionally excluded from this package. Use a local test
save and adjust those paths if reproducing the checks.

## Appearance-format references

New implementation code is written for EverSave. Format/selector facts were
cross-checked against these primary reverse-engineering sources:
- https://github.com/Hapfel1/er-save-manager/blob/main/src/er_save_manager/parser/user_data_10.py
- https://github.com/Hapfel1/er-save-manager/blob/main/src/er_save_manager/parser/character_presets.py
- https://github.com/oisis/EldenRing-SaveForge/blob/main/spec/31-appearance-presets.md
- https://github.com/oisis/EldenRing-SaveForge/blob/main/backend/db/data/hair_mapping.go
- https://github.com/oisis/EldenRing-SaveForge/blob/main/backend/db/data/face_bone_mapping.go
- https://github.com/oisis/EldenRing-SaveForge/blob/main/backend/db/data/female_model_mapping.go
