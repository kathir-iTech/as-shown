import type { Bundle } from "./model";
type Job =
  | { action: "import"; bytes: Uint8Array }
  | { action: "export" | "html"; bundle: Bundle; kind: "item" | "decision" };
function run<T>(job: Job): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../packages/archive.worker.ts", import.meta.url),
      { type: "module" },
    );
    const timer = setTimeout(() => {
      worker.terminate();
      reject(
        new Error("Record processing took too long. Try a smaller package."),
      );
    }, 60000);
    const finish = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    worker.onmessage = (event) => {
      finish();
      if (event.data.ok) resolve(event.data.result);
      else reject(new Error(event.data.message));
    };
    worker.onerror = () => {
      finish();
      reject(
        new Error(
          "This browser could not process the package. Try reopening the page.",
        ),
      );
    };
    worker.postMessage(job);
  });
}
export const openPackage = (bytes: Uint8Array) =>
  run<Bundle>({ action: "import", bytes });
export const savePackage = (bundle: Bundle, kind: "item" | "decision") =>
  run<Uint8Array>({ action: "export", bundle, kind });
export const saveHtml = (bundle: Bundle, kind: "item" | "decision") =>
  run<Uint8Array>({ action: "html", bundle, kind });
