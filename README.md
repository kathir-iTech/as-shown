# AsShown

**See the style. Keep the story.**

A secondhand garment's original condition evidence stays beside a real YouCam style preview. The buyer reviews one exact item revision and can take the actual images and notes away in a portable package.

This is a limited-credit, non-commercial hackathon prototype—not a marketplace, defect detector, authenticity service, sizing tool or fit guarantee.

## Try the product

Website: [asshown.vercel.app](https://asshown.vercel.app) · [Source repository](https://github.com/kathir-iTech/asshown)

- Explore the completed example without supplying a photograph or API credential.
- Create a seller record with a reference, front/back views and an explicit condition declaration. Every declared issue needs a linked close-up.
- Export a seller-only item package and open it in another browser context.
- Deliberately approve a live preview. Only the prepared shopper image and garment reference go to YouCam.
- Review original evidence, mark personal preferences, and save a private decision package. Extract the **complete ZIP** and open `viewer.html` offline.

All public sample people, garments and condition examples are synthetic. The recorded preview is an actual YouCam API output, not a mocked API response. See [the asset ledger](docs/ASSET_LEDGER.md).

## Local setup

Node.js 24 LTS and npm are recommended. Dependencies are exact-version pinned in `package-lock.json`.

```sh
npm ci --ignore-scripts
node scripts/setup-local.mjs
npm run dev
```

Open the Local URL printed by Next.js. The recorded example, record editor and package functions work without an API key. `setup-local` creates an ignored `.env.local`, preserves existing values and generates a token-signing secret without printing it.

For live previews, privately edit `.env.local`:

- `YOUCAM_API_KEY`: your own authorized YouCam API key.
- Keep `YOUCAM_API_BASE_URL=https://yce-api-01.makeupar.com`.
- Enable `YOUCAM_ALLOW_GENERATION` and `YOUCAM_PREPAID_ONLY_CONFIRMED` **only after** verifying prepaid/free units and disabling automatic purchases. Defaults are false.
- `ASSHOWN_UNIT_RESERVE` defaults to 100 and cannot be lower than 100 in this build.

Do not put credentials in chat, source, command arguments, screenshots, public logs, or a `NEXT_PUBLIC_` variable. A ChatGPT subscription is not an API subscription; this product uses no separately billed general-purpose LLM API.

The live path rechecks current V3 pricing (no more than two units per result) and active balance before creating a task. It has no checkout, top-up, automatic paid fallback or task-creation retry. Unknown submission outcomes stop and need operator investigation.

## Checks and production build

```sh
npm run typecheck -- --incremental false
npm test
npx playwright install chromium
npm run test:e2e
npm run build
npm start
```

On Windows the browser tests use installed Google Chrome. On other systems install Playwright Chromium as shown. Ordinary tests use local assets and mocked provider responses, not free units. The separately recorded live checks are described in release evidence; test fixtures are not presented as live results.

To test an already deployed site, set `ASSHOWN_TEST_URL` to its HTTPS origin before running the browser suite. The suite does not generate a real preview: the submission-failure case intercepts the creation request.

## Verify an exported package

```sh
npm run verify-package -- /path/to/asshown-decision-r1.zip
```

The verifier checks bounded archive structure, manifest/file agreement, image headers and record/review/preview bindings. It never executes the imported HTML. Passing does **not** certify an unknown package's HTML as safe to open: import into AsShown and re-export to regenerate the script-free viewer. Digests do not establish seller identity, truthfulness, trusted time or physical condition; someone replacing both data and digests can recompute them.

## Architecture and privacy

Next.js 16 / React 19 / TypeScript, Zod, Sharp and fflate. Records and optional drafts use browser memory and IndexedDB. There is no database, cloud upload library, account system, analytics SDK or general-purpose LLM dependency.

The server validates a minimal structural admission containing identifiers, dimensions, sizes and digests—not seller descriptions, flaw annotations or buyer notes. The complete record is checked in the browser. A structural commitment is not independent verification of withheld source photos. Signed, session-bound run tokens allow status/result retrieval without accepting arbitrary result URLs from the client.

The provider processes the two approved images. Its policy describes USA storage and generally 30-day retention with exceptions. App-local clearing does not erase provider data, platform logs, backups or previous downloads. Read [architecture and limitations](docs/ARCHITECTURE.md) and the in-app Privacy & limits page.

In-process counters or cookies are not a durable global quota. The app's reserve check can race under concurrent requests and is not comprehensive abuse prevention. The hard money boundary is an operator-verified prepaid arrangement with automatic purchases disabled. Monitor free units and pause the feature if needed. No unlimited-live-service promise is made.

## Deployment

Use one new Vercel project on an eligible personal/non-commercial Hobby arrangement. Set secrets server-side; use a separate signing secret per environment and verify project/team selection before configuring it. Do not buy domains, enable paid integrations or upgrade a plan. See [.env.example](.env.example).

`GET /api/health` reports configuration capability, not a promise of provider uptime or remaining credits. The server logs safe classifications only. No raw provider body, signed result URL, personal image, API key or buyer note is intentionally logged.

## Ownership and scope

MIT for original code; retain dependency licenses. This project was built with AI-assisted research, design, coding and testing. Generated asset origins and limitations are disclosed. There is no claim of absolute novelty, proven commercial impact, independent user validation, universal accessibility certification, or a guaranteed hackathon win.

The owner handles the video and final Devpost submission. Technical completion and outstanding checks are documented separately; a working prototype is not a promise of permanent correctness or unlimited free hosting.
