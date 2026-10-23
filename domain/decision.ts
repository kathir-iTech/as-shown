import { canonical, type Bundle, type Item } from "./model";

/** Transparent, deterministic review assistance. No model, scores or condition inference. */
export function decisionBrief(bundle: Bundle) {
  const { item, review } = bundle;
  const groups = {
    unreviewed: item.flaws.filter(
      (f) => !review.decisions[f.id] || review.decisions[f.id] === "unreviewed",
    ),
    acceptable: item.flaws.filter(
      (f) => review.decisions[f.id] === "acceptable",
    ),
    questions: item.flaws.filter(
      (f) => review.decisions[f.id] === "ask-seller",
    ),
    skipped: item.flaws.filter((f) => review.decisions[f.id] === "skip"),
  };
  const title =
    item.declaration === "not-supplied"
      ? "Condition information not supplied."
      : groups.skipped.length
        ? "You have a reason to pass."
        : groups.unreviewed.length
          ? "There’s more to look at."
          : groups.questions.length
            ? "A conversation comes next."
            : item.flaws.length
              ? "Your declared-issue review is complete."
              : "No known issues were declared.";
  const questions = groups.questions.map(
    (f) =>
      `Could you share more detail and another clear photo of: ${f.description}`,
  );
  const message = [
    `Hi! I’m looking at “${item.title}” (record revision ${item.revision}).`,
    ...(item.declaration === "not-supplied"
      ? [
          "I only have a reference photo. Could you send original front, back and close-up photographs, disclose any wear or damage, and provide measurements?",
        ]
      : []),
    ...questions.map((q, i) => `${i + 1}. ${q}`),
    ...(review.notes.trim()
      ? [`My notes / questions:\n${review.notes.trim()}`]
      : []),
    ...(questions.length || review.notes.trim()
      ? []
      : [
          "Could you confirm whether there is any wear or damage beyond the current record, and provide the garment’s measurements?",
        ]),
    "Thank you!",
  ].join("\n\n");
  return {
    ...groups,
    title,
    message,
    reviewed: item.flaws.length - groups.unreviewed.length,
    total: item.flaws.length,
  };
}

export function revisionChanges(before: Item, after: Item): string[] {
  if (before.itemId !== after.itemId)
    return ["Different item: previous decisions do not carry over."];
  const changes: string[] = [];
  if (before.title !== after.title) changes.push("Item title changed.");
  if (before.category !== after.category)
    changes.push("Garment category changed; the old preview cannot be reused.");
  if (before.description !== after.description)
    changes.push("Seller description changed.");
  if (before.declaration !== after.declaration)
    changes.push("Condition declaration changed.");
  for (const role of ["reference", "front", "back"] as const) {
    if (
      before.assets.find((a) => a.role === role)?.digest !==
      after.assets.find((a) => a.role === role)?.digest
    )
      changes.push(`${role[0].toUpperCase() + role.slice(1)} photo changed.`);
  }
  for (const flaw of after.flaws) {
    const previous = before.flaws.find((f) => f.id === flaw.id);
    if (!previous) changes.push(`Added declared issue: ${flaw.description}`);
    else if (
      canonical(previous) !== canonical(flaw) ||
      previous.closeupAssetIds.some(
        (id) =>
          before.assets.find((a) => a.id === id)?.digest !==
          after.assets.find((a) => a.id === id)?.digest,
      )
    )
      changes.push(
        `Updated declared issue or linked evidence: ${flaw.description}`,
      );
  }
  for (const flaw of before.flaws)
    if (!after.flaws.some((f) => f.id === flaw.id))
      changes.push(`Removed declared issue: ${flaw.description}`);
  return changes.length
    ? changes
    : ["Record reissued without changes to its content."];
}
