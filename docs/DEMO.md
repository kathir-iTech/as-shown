# Judge walkthrough

[Open As-Shown](https://as-shown.vercel.app) · [Open the completed example directly](https://as-shown.vercel.app/examples/linen-shirt)

## A complete decision, without an API key

1. Open the completed linen-shirt example. **Recorded YouCam example** is a mode label, not a new-generation claim. The shopper and garment are synthetic.
2. In **Try on**, compare the recorded generated look with the original reference. Adjust the view; original source photographs stay separate.
3. Select **Inspect**. Open **Inspect the linked source view** to see the seller-selected source region and separately linked close-up. These are controlled synthetic condition fixtures, not API-detected defects or measured garment evidence.
4. Close the inspector, choose **Ask seller** and enter: `Could you show the reverse of the cuff and confirm the measurements?` The app does not send this note or contact a seller.
5. Select **Save** and acknowledge the private-image warning. Download **Save readable record (HTML)**. Open the downloaded file with networking off: the original photographs, recorded result, revision and note remain readable. **Download private decision** produces a ZIP that can be verified and imported through **Open an As-Shown package** on the fitting-room page.

The ZIP checks file agreement, not seller honesty, physical authenticity or a trusted signature. The HTML reader contains no executable application scripts. Never import unknown downloaded HTML; use the app's bounded ZIP importer instead.

## Bring your own find

Return to the fitting room. Select a garment category, name your piece and use **Try my item** to upload an authorized JPEG or PNG. Your own rack is not limited to the three examples. A quick reference does not invent front/back photographs or condition declarations.

For live try-on, choose an adult photo or the labelled synthetic adult sample. Read the transmission disclosure and approve the two selected images before using **Send approved images & preview**. Provider restrictions, finite credits and input failures still apply. A photo is labelled as an input until a genuine result exists. Routine inspection/export of the recorded examples does not submit a provider task.

## Technical proof

- Provider: **YouCam Clothes Virtual Try-On V3**, task route `/s2s/v2.0/task/cloth-v3`. Categories are explicit, not inferred.
- Only the prepared garment reference and approved adult image are transmitted. Private buyer notes and unrelated condition close-ups are not sent to the preview API.
- An atomic Redis/Lua ledger admits request intents and conservatively reserves the app allowance. Status/recovery reads known tasks; unknown creation outcomes stop rather than automatically retry. This is not cross-provider exactly-once execution or a refund guarantee.
- [Current release](USABILITY_RELEASE.md) links 77 unit/integration tests, 27 controlled browser cases, 27 public-site cases and a separate actual provider check. Tests and real calls are distinguished.

This is a non-commercial, limited-credit functional prototype. No account or payment is required to open it. No conversion uplift, return reduction, physical-fit guarantee, authenticity certification or real-user study is asserted.
