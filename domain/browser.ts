import {
  type Asset,
  type Bundle,
  type Item,
  freshReview,
  imageDimensions,
  sha256,
  MAX_INPUT_BYTES,
  MAX_ASSET_BYTES,
  sealItem,
  referenceOf,
} from "./model";

export async function readAsset(
  file: File,
  role: Asset["role"],
): Promise<{ asset: Asset; bytes: Uint8Array }> {
  if (file.size > MAX_ASSET_BYTES)
    throw new Error("Choose a JPEG or PNG source image below 12 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const meta = imageDimensions(bytes);
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
  imageDimensions(new Uint8Array(await file.arrayBuffer()));
  return prepareInput(file);
}
/** Re-encoding applies orientation and strips metadata, without altering evidence bytes. */
export async function prepareInput(file: Blob): Promise<Uint8Array> {
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
  for (const quality of [0.9, 0.8, 0.68]) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (blob && blob.size <= MAX_INPUT_BYTES)
      return new Uint8Array(await blob.arrayBuffer());
  }
  for (const edge of [1600, 1280]) {
    const smaller = document.createElement("canvas");
    const factor = Math.min(1, edge / Math.max(canvas.width, canvas.height));
    smaller.width = Math.round(canvas.width * factor);
    smaller.height = Math.round(canvas.height * factor);
    const smallerContext = smaller.getContext("2d");
    if (!smallerContext) break;
    smallerContext.drawImage(canvas, 0, 0, smaller.width, smaller.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      smaller.toBlob(resolve, "image/jpeg", 0.82),
    );
    if (blob && blob.size <= MAX_INPUT_BYTES)
      return new Uint8Array(await blob.arrayBuffer());
  }
  throw new Error(
    "This photograph cannot be prepared within the preview limit. Choose a simpler reference; the original evidence remains unchanged.",
  );
}
export async function prepareReference(bundle: Bundle): Promise<Bundle> {
  if (bundle.item.assets.some((a) => a.role === "preview-reference"))
    return bundle;
  const source = referenceOf(bundle.item);
  const bytes = await prepareInput(
    new Blob([new Uint8Array(bundle.assets[source.id])], { type: source.mime }),
  );
  const derivative: Asset = {
    id: crypto.randomUUID(),
    role: "preview-reference",
    ...imageDimensions(bytes),
    byteLength: bytes.length,
    digest: await sha256(bytes),
    sourceDigest: source.digest,
    description: "Prepared YouCam input derived from the original reference",
    origin: source.origin,
    transformations: [
      "Locally resized to a maximum 2048 px; JPEG encoded; orientation applied; metadata removed. Original source retained.",
    ],
  };
  const { contentDigest: _digest, ...content } = bundle.item;
  const item = await sealItem({
    ...content,
    schemaVersion: 2,
    revision: content.revision + 1,
    createdAt: new Date().toISOString(),
    assets: [...content.assets, derivative],
  });
  return {
    item,
    assets: { ...bundle.assets, [derivative.id]: bytes },
    review: freshReview(item),
  };
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
  const draft = {
    item: bundle.item,
    assets: bundle.assets,
    review: bundle.review,
  };
  await putLocal(`record:${bundle.item.itemId}`, draft);
  await putLocal("draft", draft);
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
