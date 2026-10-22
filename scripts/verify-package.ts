import { readFile } from "node:fs/promises";
import { importPackage } from "../packages/archive";
try {
  if (process.argv.length !== 3)
    throw new Error("Usage: npm run verify-package -- /path/to/package.zip");
  const bundle = await importPackage(
    new Uint8Array(await readFile(process.argv[2])),
  );
  console.log(
    JSON.stringify(
      {
        status: "file-agreement-verified",
        schema: bundle.item.schemaVersion,
        revision: bundle.item.revision,
        sourceImages: bundle.item.assets.length,
        declaredIssues: bundle.item.flaws.length,
        previewBytesPresent: !!bundle.result,
        limitations:
          "Not authenticity, seller identity, trusted time or condition verification. Imported HTML was not executed or certified safe; re-export through As-Shown for a regenerated viewer.",
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Package validation failed.",
  );
  process.exitCode = 1;
}
