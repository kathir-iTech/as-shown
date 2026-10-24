import {
  type Bundle,
  type Category,
  canReusePreview,
  freshReview,
  sealItem,
  verifyBundle,
} from "./model";

/** Edit a shopper reference without inventing a seller disclosure or new item. */
export async function reviseQuickTry(
  bundle: Bundle,
  changes: { title: string; category: Category; replacement?: Bundle },
): Promise<Bundle> {
  if (
    bundle.item.declaration !== "not-supplied" ||
    (changes.replacement &&
      changes.replacement.item.declaration !== "not-supplied")
  )
    throw Error("Use the seller editor for a seller record.");
  const source = changes.replacement || bundle;
  const { contentDigest: _digest, ...content } = bundle.item;
  const item = await sealItem({
    ...content,
    title: changes.title.trim(),
    category: changes.category,
    revision: bundle.item.revision + 1,
    assets: source.item.assets,
  });
  const reuse =
    bundle.preview && bundle.result && canReusePreview(item, bundle.preview);
  const next: Bundle = {
    item,
    assets: source.assets,
    review: { ...freshReview(item), notes: bundle.review.notes },
    ...(reuse
      ? {
          preview: {
            ...bundle.preview!,
            itemDigest: item.contentDigest,
            reusedFromItemDigest: bundle.preview!.itemDigest,
          },
          result: bundle.result,
        }
      : {}),
  };
  await verifyBundle(next);
  return next;
}
