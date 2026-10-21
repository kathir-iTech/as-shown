# Architecture, boundaries and limits

## One coherent workflow

Seller editor → versioned item and source bytes → seller-only ZIP or optional expiring seller link → buyer import → optional consented YouCam style preview beside original evidence → condition review → private ZIP or standalone offline HTML.

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

The table describes local/preview processing. Explicit optional publication additionally sends the seller record (including descriptions, regions and source photographs) to AsShown's server and private Blob storage. It NEVER publishes the private preview, buyer decisions or notes. Sharp creates new orientation-corrected, metadata-free JPEGs in a separate revision; local originals remain unchanged. A link recipient can download this copy, so revocation cannot recall earlier downloads. Publication consent is separate from preview consent.

The provider policy is external to the app. Retention, USA storage, biometric implications and exceptions are disclosed before transmission. Never equate clearing browser storage with deleting provider-held data. EXIF is removed from prepared live inputs. Local seller source bytes remain unchanged and may contain metadata; exported local packages retain it, unlike the explicit hosted publication copy.

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

A missing/uncertain creation response is not permission to resubmit. If the provider accepted work but the response was lost, the entry remains reserved/unknown and the UI stops. Only a confirmed failure BEFORE task submission releases the two-unit app reservation, using an atomic compare-and-set and decrement in the same Redis operation. Repeated completion cannot decrement twice. Submitted failures and ambiguous outcomes retain the reservation. This is **not** a provider-unit refund or exactly-once transaction across Redis and YouCam. Disabled generation is checked atomically after existing-intent lookup, allowing known replay without reserving new work.

Tokens expire after two hours; saved local packages do not depend on the token or provider link. A completed task's capability remains in device storage so a refresh can re-fetch the same known image; personal input/result bytes are not persisted there. Explicit clearing removes it. If a result was never exported before expiry, recovery is not guaranteed. Closing a browser does not guarantee cancellation of a running remote task.

## Package format and import

`record.json`, `manifest.json`, `assets/<id>.jpg|png`, optional `preview.jpg|png`, and generated `viewer.html`. Item packages exclude buyer review and generated likeness. Decision packages include them only after the private-image warning.

Imports are untrusted. Central-directory preflight rejects traversal, duplicate/unknown names, unsupported compression, encrypted/multi-volume/ZIP64 layouts and oversized declared expansion. Streaming decompression uses small pushes and an actual expanded-byte cap. Limits: 25 MB compressed, 60 MB expanded, 50 entries, source images up to 12 MB, 8192 px per side and 40 megapixels; stricter 1.2 MB applies per live input. Prepared browser inputs are capped at 2048 px; server input admission additionally decodes with Sharp. ZIP work happens in a dedicated browser worker with a timeout. Already-compressed photographs are stored without redundant deflation. The app ignores imported HTML and regenerates its own script-free viewer on export; standalone HTML embeds its images. Notes are rendered as text.

Version 1 records remain importable. Version 2 optionally adds a `preview-reference` with its original reference's `sourceDigest`. The exact prepared reference is bound to generation/reuse. A change to this input invalidates prior preview reuse; description-only revisions may deliberately reuse it after fresh condition review.

There is no signing authority or trusted timestamp. Checks establish internal agreement, not authorship, seller honesty, certification, absence of prior edits, or physical authenticity.

## Hosting and resource limits

Node.js functions, dynamically rendered nonce-bearing pages, a Free Upstash Redis operational ledger and optional private Blob seller-copy storage; no personal-photo library or persistent server filesystem. Preview request bodies are capped below 3 MB; downloaded results below 3 MB. Publication archives are capped at 3.5 MB. API calls are short and separately bounded. A prepaid/free account with auto-refill off is a deployment prerequisite, not something code can enforce against future billing changes.

The application lifetime allowance defaults to 800 units and cannot be configured higher. Lua atomically enforces this app-only allowance plus ten admissions per session/hour and twenty per network/hour. This is separate from the provider's active-balance check, which cannot reserve units against other apps or operator use. Submitted/uncertain admissions retain their conservative allowance; operators must reconcile before any intentional reset. Existing v3 aggregate keys are preserved. Do not enable Redis eviction or automatic plan upgrades.

Request entries expire after 24 hours; signed tokens after two hours; hourly counter keys after two hours. Session/request/network IDs use keyed HMACs. The ledger contains digest commitments and signed task recovery information, not image bytes or notes. Its aggregate unit counter has no expiry and no individual request details. Network headers are trusted only on Vercel, where the platform overwrites forwarded IP headers. Local development uses session-scoped fallback.

Missing Redis configuration, unreadable ledger data, network errors or service limits pause generation. Signed sessions and shared-IP limits are not comprehensive abuse prevention: an attacker can consume a free allowance, and shared networks can encounter limits. No broad abuse-resistance claim is made. `/api/health` exposes configuration state, not a remote-service health guarantee. Operator flags disable new generations without fake success.

## Interface and decision helpers

The studio displays style and original source simultaneously (stacked on narrow screens), with source tabs, zoom, a keyboard-operable split control and linked detail selection. Seller regions are drawn, moved with arrow keys, resized with Shift + arrows, or entered numerically. Replacing their source resets the marker and requires reconfirmation. Each issue supports four replaceable/reorderable close-ups. Drafts autosave by exact base revision and restore after refresh. Buyer recovery is per item/revision rather than one global pending slot. Stable Next.js routes support reload/back/forward; device-only records honestly require import on a different device.

The source inspector displays markers only on original images. Decision briefs and seller questions are deterministic helpers, not another AI model. Revision changes reset buyer decisions; unchanged prepared references may explicitly reuse a prior style result. Reduced motion and keyboard paths remain available. Runtime CSP uses a nonce plus strict-dynamic without unsafe-inline scripts, prohibits embedding, and allows only bounded same-origin API calls. No personal data is placed in OG images.

## Optional hosted seller exchange

An explicit seller-only publication is immutable, expires after 24 hours and is limited to 60 lifetime publications, 100 MB lifetime reserved storage and 250 MB admitted download transfer. These counters are conservative and are not reset by expiry/revocation. Per-hour limits are three publications/session and ten/network. Redis atomically reserves before Blob upload; concurrent/replayed intents do not create a second upload. An unconfirmed upload is not automatically retried. The optional service pauses at limits; offline/local records keep working.

Read and revocation capabilities are distinct HMAC values in URL fragments, not query parameters. The API validates a same-origin POST and capability, then atomically checks expiry/revocation and transfer allowance before streaming a private Blob. Redis retains publication metadata for 48 hours, not image bytes. Revocation marks the record unavailable before deleting its file; deletion failures remain explicitly pending. A daily authenticated cleanup deletes copies older than 24 hours (physical retention may reach approximately 48 hours plus scheduling delay). The logical link stops at 24 hours regardless. No guaranteed permanent free service or exhaustive abuse defense is claimed.

## Verification limits

Automated unit/boundary and desktop/mobile browser checks are distinct from actual live tests. Manual visual checks and keyboard inspection do not amount to an independent user study or comprehensive screen-reader audit. Initial samples do not establish general performance across body types, skin tones, garments, poses, defects or lighting. A 48-hour reopen observation requires real elapsed time and must not be simulated.
