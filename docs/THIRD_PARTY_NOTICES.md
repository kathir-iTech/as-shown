# Third-party runtime dependencies

Versions and package-declared licenses checked against the installed packages on 20 October 2026. Retain upstream notices when redistributing bundled code. The lockfile records exact transitive dependencies.

| Package           | Version | License    |
| ----------------- | ------- | ---------- |
| Next.js           | 16.4.2  | MIT        |
| React / React DOM | 19.3.0  | MIT        |
| Zod               | 4.6.7   | MIT        |
| fflate            | 0.8.3   | MIT        |
| Sharp             | 0.35.5  | Apache-2.0 |
| lucide-react      | 1.55.0  | ISC        |
| @vercel/blob      | 2.8.1   | Apache-2.0 |

The optional Blob SDK entry was refreshed against the installed package on 24 October 2026. Self-hosted Manrope Variable and Bricolage Grotesque Variable, both 5.3.0, declare OFL-1.1; their full notices are retained in `public/font-licenses.txt`. Repository/media artwork uses these same fonts rather than a remote font service.

Sharp's distributed native libraries include additional upstream components and notices; retain their packaged licenses. A package's own license is not a claim that every transitive component has the same license.

Development-only tools include TypeScript, Vitest, Playwright, axe-core's Playwright adapter, tsx and Prettier. Their notices remain in installed packages. Production dependency audit reported zero known vulnerabilities at this check; that is not a guarantee of security or future advisory status.
