import {
  type Asset,
  type Bundle,
  type Item,
  freshReview,
  imageDimensions,
  sha256,
  MAX_INPUT_BYTES,
} from "./model";

export async function readAsset(
  file: File,
  role: Asset["role"],
): Promise<{ asset: Asset; bytes: Uint8Array }> {
  if (file.size > 6_000_000)
    throw new Error("Choose a source image below 6 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const meta = imageDimensions(bytes);
  if (role === "reference" && bytes.length > MAX_INPUT_BYTES)
    throw new Error(
      "The preview reference must be below 1.2 MB. Other source photos may be up to 6 MB.",
    );
  const decoded = await createImageBitmap(file);
  decoded.close();
  return {
    bytes,
    asset: {
      id: crypto.randomUUID(),
      role,
      ...meta,
      byteLength: bytes.length,
      digest: await sha256(bytes),
      description: `${role === "closeup" ? "Condition close-up" : role + " photo"} supplied by seller`,
      origin: "seller-upload",
      transformations: [],
    },
  };
}
export async function prepareShopper(file: File): Promise<Uint8Array> {
  if (
    file.size > 12_000_000 ||
    !["image/jpeg", "image/png"].includes(file.type)
  )
    throw new Error("Choose a JPEG or PNG photo below 12 MB.");
  const decoded = await createImageBitmap(file);
  const ratio = Math.min(1, 2048 / Math.max(decoded.width, decoded.height));
  if (
    decoded.width < 256 ||
    decoded.height < 256 ||
    decoded.width * decoded.height > 40_000_000
  ) {
    decoded.close();
    throw new Error(
      "Use a photo at least 256 pixels per side and below 40 megapixels.",
    );
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(decoded.width * ratio);
  canvas.height = Math.round(decoded.height * ratio);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    decoded.close();
    throw new Error("This browser cannot prepare the image.");
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(decoded, 0, 0, canvas.width, canvas.height);
  decoded.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.88),
  );
  if (!blob || blob.size > MAX_INPUT_BYTES)
    throw new Error(
      "This photo is still too large after local preparation. Choose a smaller, simpler photo.",
    );
  return new Uint8Array(await blob.arrayBuffer());
}
const DB = "asshown-local-v1";
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("records");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new Error("Device storage is unavailable. Export a package instead."),
      );
  });
}
export async function putLocal(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("records", "readwrite");
      tx.objectStore("records").put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(
          new Error("The draft could not be saved. Export a package instead."),
        );
    });
  } finally {
    db.close();
  }
}
export async function getLocal<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const r = db.transaction("records").objectStore("records").get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(new Error("Device storage could not be read."));
    });
  } finally {
    db.close();
  }
}
export async function clearLocal(): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("records", "readwrite");
      tx.objectStore("records").clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(new Error("Device storage could not be cleared."));
    });
  } finally {
    db.close();
  }
}
export async function saveDraft(bundle: Bundle): Promise<void> {
  await putLocal("draft", {
    item: bundle.item,
    assets: bundle.assets,
    review: bundle.review,
  });
}
export function download(
  bytes: Uint8Array,
  name: string,
  mime = "application/zip",
): void {
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes)], { type: mime }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function plainDraft(item: Item, assets: Bundle["assets"]): Bundle {
  return { item, assets, review: freshReview(item) };
}
