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
  type Category,
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
    schemaVersion: content.schemaVersion === 3 ? 3 : 2,
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
  // Enforce rack limits inside the same write transaction as the save. Two tabs
  // cannot both observe a free slot and write past the limit.
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("records", "readwrite");
      const store = tx.objectStore("records");
      let count = 0;
      let bytes = draft.item.assets.reduce((sum, a) => sum + a.byteLength, 0);
      let limitError = false;
      const cursor = store.openCursor(
        IDBKeyRange.bound("record:", "record:\uffff"),
      );
      cursor.onsuccess = () => {
        const row = cursor.result;
        if (row) {
          if (row.key !== "record:" + bundle.item.itemId) {
            count++;
            bytes += (row.value as Bundle).item.assets.reduce(
              (sum, a) => sum + a.byteLength,
              0,
            );
          }
          row.continue();
          return;
        }
        if (count >= RACK_LIMITS.records || bytes > RACK_LIMITS.sourceBytes) {
          limitError = true;
          tx.abort();
          return;
        }
        store.put(draft, "record:" + bundle.item.itemId);
        store.put(draft, "draft");
        const oldLook = store.get("look:" + bundle.item.itemId);
        oldLook.onsuccess = () => {
          const saved = oldLook.result as Pick<Bundle, "preview"> | undefined;
          if (
            saved?.preview &&
            saved.preview.itemDigest !== bundle.item.contentDigest
          )
            store.delete("look:" + bundle.item.itemId);
        };
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(
          new Error(
            limitError
              ? "This device rack is full (40 items / 100 MB of source photos). Export and remove a piece first."
              : "The record could not be saved. Export a package instead.",
          ),
        );
      tx.onerror = () =>
        reject(
          new Error(
            "Device storage could not save the record. Export a package instead.",
          ),
        );
    });
  } finally {
    db.close();
  }
  window.dispatchEvent(new Event("asshown:rack"));
}

/** A shopper's reference is not a seller declaration or a condition inspection. */
export async function createQuickTry(
  file: File,
  category: Category,
  title: string,
): Promise<Bundle> {
  const original = await readAsset(file, "reference");
  original.asset.origin = "shopper-upload";
  original.asset.description =
    "Original garment reference supplied by shopper; condition not supplied";
  const item = await sealItem({
    schemaVersion: 3,
    itemId: crypto.randomUUID(),
    revision: 1,
    title: title.trim().slice(0, 120) || "My thrift find",
    description:
      "Quick Try from a garment photograph. No seller condition information has been supplied.",
    category,
    createdAt: new Date().toISOString(),
    declaration: "not-supplied",
    assets: [original.asset],
    flaws: [],
  });
  return prepareReference({
    item,
    assets: { [original.asset.id]: original.bytes },
    review: freshReview(item),
  });
}

export type RackStatus = "considering" | "shortlisted" | "passed";
export type RackMeta = {
  status: RackStatus;
  collection: string;
  order: number;
};
export type RackEntry = { bundle: Bundle; meta: RackMeta; savedLook: boolean };
export const RACK_LIMITS = {
  records: 40,
  sourceBytes: 100_000_000,
  lookBytes: 50_000_000,
};
export const defaultRackMeta = (): RackMeta => ({
  status: "considering",
  collection: "",
  order: 0,
});

export async function listRack(): Promise<RackEntry[]> {
  const db = await openDb();
  try {
    const rows = await new Promise<[string, unknown][]>((resolve, reject) => {
      const values: [string, unknown][] = [];
      const request = db
        .transaction("records")
        .objectStore("records")
        .openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return resolve(values);
        if (
          typeof cursor.key === "string" &&
          /^(record:|rack:|look:)/.test(cursor.key)
        )
          values.push([cursor.key, cursor.value]);
        cursor.continue();
      };
      request.onerror = () =>
        reject(new Error("Your rack could not be opened."));
    });
    const map = new Map(rows);
    return rows
      .filter(([key]) => key.startsWith("record:"))
      .map(([, value]) => {
        const bundle = value as Bundle;
        const look = map.get("look:" + bundle.item.itemId) as
          Pick<Bundle, "preview" | "result"> | undefined;
        const savedLook = !!(
          look?.preview &&
          look.result &&
          look.preview.itemDigest === bundle.item.contentDigest
        );
        return {
          bundle: savedLook ? { ...bundle, ...look } : bundle,
          meta: {
            ...defaultRackMeta(),
            ...(map.get("rack:" + bundle.item.itemId) as
              Partial<RackMeta> | undefined),
          },
          savedLook,
        };
      })
      .sort(
        (a, b) =>
          a.meta.order - b.meta.order ||
          b.bundle.item.createdAt.localeCompare(a.bundle.item.createdAt),
      );
  } finally {
    db.close();
  }
}
export async function getRackRecord(id: string): Promise<Bundle | undefined> {
  const source = await getLocal<Bundle>("record:" + id);
  if (!source) return;
  const look = await getLocal<Pick<Bundle, "preview" | "result">>("look:" + id);
  return look?.preview?.itemDigest === source.item.contentDigest && look.result
    ? { ...source, ...look }
    : source;
}
export async function addToRack(bundle: Bundle): Promise<void> {
  await saveDraft(bundle);
}
export async function saveRackMeta(
  id: string,
  changes: Partial<RackMeta>,
): Promise<void> {
  // Patch within one transaction: rapid collection edits must not overwrite a
  // shortlist choice from an earlier render or another tab.
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("records", "readwrite");
      const store = tx.objectStore("records");
      const read = store.get("rack:" + id);
      read.onsuccess = () => {
        const next = {
          ...defaultRackMeta(),
          ...read.result,
          ...changes,
        } as RackMeta;
        store.put(
          { ...next, collection: next.collection.trim().slice(0, 60) },
          "rack:" + id,
        );
      };
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () =>
        reject(new Error("The rack preference could not be saved."));
    });
  } finally {
    db.close();
  }
  window.dispatchEvent(new Event("asshown:rack"));
}
export async function rememberLook(
  bundle: Bundle,
  remember: boolean,
): Promise<void> {
  if (remember && (!bundle.result || !bundle.preview))
    throw new Error("Generate a preview before saving a look.");
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("records", "readwrite");
      const store = tx.objectStore("records");
      const key = "look:" + bundle.item.itemId;
      let bytes = remember ? bundle.result!.length : 0;
      let limited = false;
      const cursor = store.openCursor(
        IDBKeyRange.bound("look:", "look:\uffff"),
      );
      cursor.onsuccess = () => {
        const row = cursor.result;
        if (row) {
          if (row.key !== key)
            bytes +=
              (row.value as Pick<Bundle, "result"> | undefined)?.result
                ?.length || 0;
          row.continue();
          return;
        }
        if (bytes > RACK_LIMITS.lookBytes) {
          limited = true;
          tx.abort();
          return;
        }
        if (remember)
          store.put({ preview: bundle.preview, result: bundle.result }, key);
        else store.delete(key);
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(
          new Error(
            limited
              ? "Your saved looks reached the 50 MB device limit. Export and remove an older look first."
              : "The look could not be saved.",
          ),
        );
      tx.onerror = () =>
        reject(new Error("The saved-look preference could not be changed."));
    });
  } finally {
    db.close();
  }
  window.dispatchEvent(new Event("asshown:rack"));
}
export async function removeRackRecord(id: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("records", "readwrite");
      const store = tx.objectStore("records");
      const source = store.get("record:" + id);
      source.onsuccess = () => {
        const digest = (source.result as Bundle | undefined)?.item
          .contentDigest;
        if (digest) store.delete("seller-draft:" + digest);
      };
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        const row = cursor.result;
        if (!row) return;
        const key = String(row.key);
        const value = row.value as
          (Bundle & { ownerItemId?: string }) | undefined;
        if (
          ["record:" + id, "rack:" + id, "look:" + id].includes(key) ||
          key.startsWith("pending:" + id + ":") ||
          (key.startsWith("seller-draft:") && value?.ownerItemId === id) ||
          (key === "draft" && value?.item?.itemId === id)
        )
          row.delete();
        row.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error("This item could not be removed."));
    });
  } finally {
    db.close();
  }
  window.dispatchEvent(new Event("asshown:rack"));
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
