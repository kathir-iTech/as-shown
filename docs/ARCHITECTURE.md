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
4. It paginates authenticated feature costs and checks active units against the reserve. Failure to verify pauses generation.
5. It registers and PUT-uploads only two files, then creates one explicit Clothes VTO V3 upper-body task.
6. A signed token binds task ID, session, item digest and input digests. Short status requests never recreate tasks. No server function sleeps waiting for generation.
7. Result retrieval queries the known provider task and only downloads from reviewed provider-storage hosts. The client cannot submit an arbitrary download URL.
8. The actual result bytes are checked, rendered and optionally exported.

The server does not receive all condition evidence, so it cannot independently recompute the full item digest or verify every withheld file. It validates structural commitments and the actual reference it receives. The browser enforces full-file agreement for the ordinary application path. A malicious seller can fabricate an entire consistently hashed record.

## Failure behavior

Known task tokens survive a refresh in IndexedDB. A missing/uncertain creation response is not permission to resubmit. The UI stops; inspect provider history before any deliberate new task. Definite validation/authentication/rate-limit rejections are distinct from ambiguous server/network failures. There is no exactly-once guarantee across crashes: no durable distributed idempotency ledger is implemented.

Tokens expire after two hours; saved local packages do not depend on the token or provider link. If a result was never saved before expiry, recovery is not guaranteed. Closing a browser does not guarantee cancellation of a running remote task.

## Package format and import

`record.json`, `manifest.json`, `assets/<id>.jpg|png`, optional `preview.jpg|png`, and generated `viewer.html`. Item packages exclude buyer review and generated likeness. Decision packages include them only after the private-image warning.

Imports are untrusted. Central-directory preflight rejects traversal, duplicate/unknown names, unsupported compression, encrypted/multi-volume/ZIP64 layouts and oversized declared expansion. Streaming decompression uses small pushes and an actual expanded-byte cap. Limits: 25 MB compressed, 60 MB expanded, 50 entries, source/result images up to 6 MB and 4096 px per side; stricter 1.2 MB applies per live input. The application ignores imported viewer HTML and regenerates its own script-free viewer on export. Notes are rendered as text.

There is no signing authority or trusted timestamp. Checks establish internal agreement, not authorship, seller honesty, certification, absence of prior edits, or physical authenticity.

## Hosting and resource limits

Node.js functions and one static frontend, no persistent server filesystem or paid storage. Request bodies are capped below 3 MB; downloaded results below 3 MB. API calls are short and separately bounded. A prepaid/free account with auto-refill off is a deployment prerequisite, not something this code can enforce against future account-owner billing changes.

The free-unit reserve check is not a transactional reservation: concurrent calls can race. Signed sessions do not prevent a determined actor from creating new sessions. No broad abuse-resistance claim is made. `/api/health` exposes configuration state only. Operator flags disable new generations without replacing them with fake success.

## Verification limits

Automated unit/boundary and desktop/mobile browser checks are distinct from actual live tests. Manual visual checks and keyboard inspection do not amount to an independent user study or comprehensive screen-reader audit. Initial samples do not establish general performance across body types, skin tones, garments, poses, defects or lighting. A 48-hour reopen observation requires real elapsed time and must not be simulated.
