# Architecture, boundaries and limits

## One coherent workflow

Seller editor → versioned item and source bytes → seller-only ZIP → buyer import → optional consented YouCam style preview → original-evidence review → private decision ZIP and offline viewer.

The record digest covers canonical JSON and referenced image digests. Changes create a revision and a fresh buyer review. If the reference image is unchanged, a buyer may deliberately reuse the prior style image; its original creation time and mode remain, with a previous-item digest attached. No new units are spent merely for a condition-note change.

## Data movement

| Data                                                             | Browser / download                      | AsShown server                                                | YouCam                                         |
| ---------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------- |
| Full record, title, description, flaw notes/regions              | Yes                                     | No                                                            | No                                             |
| Structural identifiers, dimensions, sizes and digest commitments | Yes                                     | During approved preview                                       | Not forwarded                                  |
| Seller reference photo                                           | Yes                                     | During approved preview                                       | During approved preview                        |
| Front/back condition views and close-ups                         | Yes                                     | No, unless the same bytes were separately chosen as reference | Reference only, never the condition collection |
| Prepared shopper input                                           | Memory only                             | During approved preview                                       | During approved preview                        |
| Buyer notes/preferences                                          | Memory, explicitly saved draft/package  | No                                                            | No                                             |
| Generated result                                                 | Memory, explicit private export         | Bounded retrieval                                             | Generated/stored per provider policy           |
| Recovery token                                                   | Explicitly explained IndexedDB recovery | Validated against signed cookie                               | Task ID used server-side                       |
| API credential                                                   | Never                                   | Environment only                                              | Authentication only                            |

The provider policy is external to the app. Retention, USA storage, biometric implications and exceptions are disclosed before transmission. Never equate clearing browser storage with deleting provider-held data. EXIF is removed from the prepared personal JPEG; seller source bytes remain unchanged and may contain metadata. Warn sellers to remove sensitive metadata themselves before choosing source files if appropriate.

## Provider flow

1. A user selects and locally prepares a personal or synthetic sample image.
2. The app verifies the complete local record; affirmative consent is bound to the current item and operation.
3. The server checks same-origin, a signed HTTP-only session cookie, bounded multipart bytes, admission structure, consent age/version, actual image decoding and the exact garment-reference digest.
4. A Free Upstash Redis ledger atomically reserves a session-bound request intent, two units of the app's lifetime allowance, and hourly session/network admission counters. Replayed intents reuse a known task or stop; they do not upload again. It then paginates authenticated feature costs and checks active units against the reserve. Failure to verify pauses generation.
5. It registers and PUT-uploads only two files, then creates one explicit Clothes VTO V3 upper-body task.
6. A signed token binds task ID, session, item digest and input digests. Short status requests never recreate tasks. No server function sleeps waiting for generation.
7. Result retrieval queries the known provider task and only downloads from reviewed provider-storage hosts. The client cannot submit an arbitrary download URL.
8. The actual result bytes are checked, rendered and optionally exported.

The server does not receive all condition evidence, so it cannot independently recompute the full item digest or verify every withheld file. It validates structural commitments and the actual reference it receives. The browser enforces full-file agreement for the ordinary application path. A malicious seller can fabricate an entire consistently hashed record.

## Failure behavior

Known task tokens and request intent IDs survive a refresh in IndexedDB. A recovery endpoint reads a session-bound ledger entry without submitting any provider task. Concurrent copies of one intent share one atomic reservation. The server stores the known signed task response with a compare-and-set operation; a later write cannot replace it.

A missing/uncertain creation response is not permission to resubmit. If the provider accepted work but the response was lost, the entry remains reserved/unknown and the UI stops. Definite validation/authentication/rate-limit rejections are distinct from ambiguous server/network failures. This is **not** exactly-once execution across Redis and the independent provider. Reservations are conservative and never automatically refunded.

Tokens expire after two hours; saved local packages do not depend on the token or provider link. If a result was never saved before expiry, recovery is not guaranteed. Closing a browser does not guarantee cancellation of a running remote task.

## Package format and import

`record.json`, `manifest.json`, `assets/<id>.jpg|png`, optional `preview.jpg|png`, and generated `viewer.html`. Item packages exclude buyer review and generated likeness. Decision packages include them only after the private-image warning.

Imports are untrusted. Central-directory preflight rejects traversal, duplicate/unknown names, unsupported compression, encrypted/multi-volume/ZIP64 layouts and oversized declared expansion. Streaming decompression uses small pushes and an actual expanded-byte cap. Limits: 25 MB compressed, 60 MB expanded, 50 entries, source/result images up to 6 MB and 4096 px per side; stricter 1.2 MB applies per live input. The application ignores imported viewer HTML and regenerates its own script-free viewer on export. Notes are rendered as text.

There is no signing authority or trusted timestamp. Checks establish internal agreement, not authorship, seller honesty, certification, absence of prior edits, or physical authenticity.

## Hosting and resource limits

Node.js functions, a static frontend and a Free Upstash Redis operational ledger; no cloud photo library or persistent server filesystem. Request bodies are capped below 3 MB; downloaded results below 3 MB. API calls are short and separately bounded. A prepaid/free account with auto-refill off is a deployment prerequisite, not something this code can enforce against future account-owner billing changes.

The application lifetime allowance defaults to 800 units and cannot be configured higher. Lua atomically enforces this app-only allowance plus ten admissions per session/hour and twenty per network/hour. This is separate from the provider's active-balance check, which cannot reserve units against other apps or operator use. Failed/uncertain admissions still consume the conservative allowance; operators must reconcile before any intentional reset. Do not enable Redis eviction or automatic plan upgrades.

Request entries expire after 24 hours; signed tokens after two hours; hourly counter keys after two hours. Session/request/network IDs use keyed HMACs. The ledger contains digest commitments and signed task recovery information, not image bytes or notes. Its aggregate unit counter has no expiry and no individual request details. Network headers are trusted only on Vercel, where the platform overwrites forwarded IP headers. Local development uses session-scoped fallback.

Missing Redis configuration, unreadable ledger data, network errors or service limits pause generation. Signed sessions and shared-IP limits are not comprehensive abuse prevention: an attacker can consume a free allowance, and shared networks can encounter limits. No broad abuse-resistance claim is made. `/api/health` exposes configuration state, not a remote-service health guarantee. Operator flags disable new generations without fake success.

## Interface and decision helpers

The editorial studio exposes separate style, seller-source and close-up lenses. The source inspector zooms original bytes and displays seller-supplied regions only on source images. The decision brief and seller-question draft are deterministic transformations of buyer choices and notes, not another AI model. Revision comparison names changed fields, disclosures and evidence and resets buyer decisions; unchanged references may explicitly reuse a prior style result. Reduced-motion preferences disable spatial effects, and the core workflow does not require hover, animation or external fonts.

## Verification limits

Automated unit/boundary and desktop/mobile browser checks are distinct from actual live tests. Manual visual checks and keyboard inspection do not amount to an independent user study or comprehensive screen-reader audit. Initial samples do not establish general performance across body types, skin tones, garments, poses, defects or lighting. A 48-hour reopen observation requires real elapsed time and must not be simulated.
