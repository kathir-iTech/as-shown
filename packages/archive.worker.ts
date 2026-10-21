import { exportPackage, importPackage, exportHtml } from "./archive";
import type { Bundle } from "../domain/model";
type Job =
  | { action: "import"; bytes: Uint8Array }
  | { action: "export" | "html"; bundle: Bundle; kind: "item" | "decision" };
self.onmessage = async (event: MessageEvent<Job>) => {
  try {
    const job = event.data;
    const result =
      job.action === "import"
        ? await importPackage(job.bytes)
        : job.action === "html"
          ? await exportHtml(job.bundle, job.kind)
          : await exportPackage(job.bundle, job.kind);
    self.postMessage({ ok: true, result });
  } catch (error) {
    self.postMessage({
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "The record could not be processed.",
    });
  }
};
