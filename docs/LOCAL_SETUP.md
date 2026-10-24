# Local setup and optional live services

The recorded demos, seller editor, rack and portable exports do not need API credentials. Run Node.js 24, `npm ci --ignore-scripts`, `node scripts/setup-local.mjs`, then `npm run dev`. The setup helper preserves existing values and creates an ignored `.env.local`; it never prints the signing secret.

## Optional live previews

Keep credentials server-side in `.env.local` or the intended deployment environment. Never put them in chat, screenshots, public logs, a `NEXT_PUBLIC_` variable or source control. See [the variable template](../.env.example).

- `YOUCAM_API_KEY`: an authorized YouCam API credential; the base URL remains `https://yce-api-01.makeupar.com`.
- Enable `YOUCAM_ALLOW_GENERATION` and `YOUCAM_PREPAID_ONLY_CONFIRMED` only after independently verifying free/prepaid credit and disabling automatic purchases.
- `KV_REST_API_URL` and `KV_REST_API_TOKEN`: the existing authorized Upstash Free ledger. Auto-upgrades and eviction remain disabled. Missing ledger access disables generation.
- `ASSHOWN_UNIT_RESERVE`: at least 100. `ASSHOWN_LIFETIME_UNIT_CAP`: at most 800. Current provider pricing must be no more than two units per result.
- The token-signing secret must be strong, server-only and distinct per environment. Do not rotate a deployed secret merely to run local tests.

This app does not purchase units, retry uncertain creation, enable paid fallbacks or provide unlimited service. A ChatGPT subscription is not an API subscription. Its ledger cannot transact with other applications using the same provider account.

## Optional seller publication

Publication reuses the authorized private Vercel Blob store and Redis ledger. Configure `BLOB_STORE_ID` with the project's existing OIDC access, or an authorized private `BLOB_READ_WRITE_TOKEN`; enable `ASSHOWN_SHARE_ENABLED` only with these services ready. A strong `CRON_SECRET` protects daily housekeeping. Do not buy a plan, enable upgrades or register a domain.

Published seller copies exclude buyer notes and personal previews. They expire logically after 24 hours; cleanup, platform retention and prior downloads are separate from immediate access revocation. See [the architecture](ARCHITECTURE.md) for storage, transfer and publication quotas.

## Browser data and tests

My Rack allows 40 records / 100 MB of source images. Separately opted-in generated looks have a 50 MB limit. Input photos are memory-only. Local data may be cleared or evicted; export important records.

Windows browser checks use installed Chrome; other environments use Playwright Chromium. Tests use controlled responses. Set `ASSHOWN_TEST_URL` to an authorized HTTPS origin to run the same public suite without real generation. `GET /api/health` reports configuration capability, not provider availability or remaining credit.

`npm run verify-package -- /absolute/path/record.zip` verifies bounded archive and file bindings without executing imported HTML. A digest is not proof of seller identity, trusted time or truthfulness. Import an unfamiliar archive into the app and re-export it to regenerate the script-free viewer.
