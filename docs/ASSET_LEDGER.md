# Asset provenance and publication labels

The public sample depicts fictional people and a fictional garment. It is not a real sale, customer endorsement, measured user study, or photographed defect. Images were created using the built-in image-generation tool, not an independently billed image API. Exact initial prompts appear in INPUT_ASSET_PROMPTS.md.

| Public asset                     | Source and transformation                                                                           | Intended label                                 |
| -------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| samples/reference.jpg, front.jpg | Original generated shirt PNG, JPEG quality 90; front intentionally reuses reference photograph      | Synthetic garment/source example               |
| samples/shopper.jpg              | Original generated fictional adult shopper PNG, JPEG quality 90                                     | Synthetic shopper                              |
| samples/preview.jpg              | Actual YouCam Clothes VTO V3 result from the same reference and shopper bytes; no visual retouching | Recorded real YouCam result; synthetic subject |
| samples/back.jpg                 | Generated corresponding back view with controlled cuff fraying; JPEG quality 92                     | Controlled synthetic condition example         |
| samples/cuff.jpg                 | Generated close-up of that cuff, using back-view image as reference; JPEG quality 94                | Controlled synthetic condition example         |

The sample record was assembled after the feasibility run, reusing that run's actual image and exact reference bytes. Condition fixtures were added afterward. There is no claim that the provider erased, reproduced or inspected their fraying. Generated views may differ in small details and are not measurements or faithful product reconstruction.

## Back-view prompt (exact)

Use case: precise-object-edit. Asset type: a clearly labelled fictional garment back-view photo for AsShown's synthetic demo. Input image is a garment design reference, not a real person's photograph. Create a corresponding BACK VIEW of this same unbranded rust-orange linen shirt, laid flat on the same off-white backdrop, entire garment within frame. Preserve the rust tone, linen weave, collar shape, long sleeves, cream cuff buttons, shirttail hem and simple catalog lighting. Back has a horizontal yoke seam, no front pocket and no center front button placket. Add a subtle short frayed area approximately 12 mm along the OUTER edge of the cuff on viewer's left, visible as a few pale loose linen threads, as a controlled synthetic example of seller-declared wear. No other holes or stains. No text, logos, watermarks, props or hands. A single clean catalog photograph, portrait orientation, not a collage. The pictured item is fictional; this must not be presented as real condition evidence.

Source generated PNG: exec-918f2ef4-f166-4d43-a0e0-2710d0b5e848.png. The prompt's approximate measurement is a generation instruction, not a measured property of the image; the application makes no millimeter claim.

## Cuff-detail prompt (exact)

Use case: precise-object-edit. Asset type: controlled synthetic condition close-up for an AsShown demo. Input image is the edit target: the fictional shirt back view with a frayed cuff on viewer's left. Make a tight photographic close-up of ONLY THAT SAME CUFF, cream button, adjacent rust-orange linen sleeve, and the existing pale loose threads at its outside edge. Preserve color, weave, button and the same existing fraying; do not introduce additional stains, holes, repairs or defects. Off-white surface behind the cuff, same natural diffused light. Macro product photograph with enough sharp detail to inspect the threads, cuff occupies most of frame. No person, no hands, no props, no labels, no text, no watermark. One square image. This is a labelled synthetic example, not real seller evidence.

Source generated PNG: exec-b8ee2dc3-dccc-4912-9347-ad13f8876e6c.png. Each generated derivative is separately labelled rather than represented as a camera crop.

Original application code is licensed MIT. Generated assets are provided as labelled demonstration material; no exclusivity, trademark clearance, or statutory copyright ownership in generated imagery is claimed. Do not reuse them to misrepresent an actual sale or person. No private repo research or participant photos are included.

## Interface typography and references

Bricolage Grotesque Variable and Manrope Variable are self-hosted through pinned Fontsource packages (5.3.0), under their bundled SIL Open Font License 1.1 terms. Their copyright notices and full license are also served at [font-licenses.txt](https://asshown.vercel.app/font-licenses.txt). The app does not claim authorship of the fonts. Lucide icons retain their package license. No runtime request to Google Fonts is required.

The v3 composition, CSS, source inspector and motion are original application code. Linear's design writing and the public Lusion, Active Theory and Bruno Simon sites informed interaction research; no code, images, proprietary assets or trade dress were copied from those sites. The technical demonstration assets remain the explicitly labelled synthetic images above.
