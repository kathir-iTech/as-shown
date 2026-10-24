# Focused fitting-room usability release

This pass responds to a real failed-preview screenshot and the owner's report that the previous interface was too dense. Earlier test passes were not a blanket production-readiness guarantee. Previous evidence remains dated and unchanged.

## Corrected workflow

- Three keyboard-accessible views: Try on, Inspect and Save. Private notes, seller tools and export controls are no longer stacked below every fitting attempt.
- Mobile photo switching keeps the original and selected/result image accessible without two full-height stacked photographs.
- A shopper photo is labelled as an input until an actual result exists. Selecting a new photo no longer leaves a previous result presented as its new preview.
- Terminal failure resets approval and shows safe classification and next actions beside the controls. Another attempt requires a deliberate new approval; no automatic generation retry is added.
- A paused or unknown task blocks new submission, photo changes and source editing. The existing task can be checked or recovered. Status/result requests have explicit browser timeouts.
- Quick edits change the name, category or reference without requiring a seller declaration or invented front/back photographs. Item identity and notes are retained. Changed inputs clear stale previews; metadata-only revisions can retain the already-opted-in identical image atomically with the source.
- Empty 0/0 metrics and repeated warning paragraphs are removed. Full disclosures remain in the appropriate Inspect, Save and privacy controls.

## Verification

Runtime, public-site checks, real-provider evidence and limitations are recorded separately in the accompanying release evidence. Controlled-response browser tests are not presented as live provider calls. Test failures are retained as failures and corrected before handoff.

The actual cause of the owner's upstream task failure cannot be established from a screenshot alone. The app does not claim to detect adulthood, pose suitability or garment categories automatically. It provides specific input guidance and explicit category selection. Unsuitable or rejected input can still fail at YouCam.

This remains a bounded, non-commercial, limited-credit functional prototype. No bug-free, universal fit, security certification, permanent free-service or winning guarantee is claimed.
