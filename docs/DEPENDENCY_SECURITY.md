# Dependency security closure — 24 October 2026

The final production audit found a vulnerable nested Zod 4.1.11 under Vercel's CLI configuration helper and Undici 6.29.0 under Blob. These were not treated as a clean release or fixed by blindly downgrading Blob.

Scoped npm overrides retain Blob 2.8.1 and its API. The CLI helper now resolves the same patched Zod 4.6.7 already used by the application. Blob resolves the official Undici 6.29.1 package. Its version-specific registry endpoint and upstream release were checked; the lockfile SHA-512 matches the registry. The official tarball URL is pinned because the npm version listing returned stale metadata and rejected the available patched version by name. No Git branch, unofficial fork, major SDK upgrade or installation script is used.

The resulting `npm audit --omit=dev` returned zero known vulnerabilities. Blob put/get/delete exports and the CLI helper's schema parsing were checked without reading credentials or making cloud calls. The full application checks are recorded separately. Quality CI now blocks high/critical production findings on future pushes.

This is a point-in-time dependency check, not a security certification or proof that every application path is invulnerable.

Primary upstream references: [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [Undici content-encoding advisory](https://github.com/advisories/GHSA-xjj6-f33q-929c), [Undici EventSource advisory](https://github.com/advisories/GHSA-4qv8-2p9j-2685), [official Undici release](https://github.com/nodejs/undici/releases/tag/v6.29.1).
