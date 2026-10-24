"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Upload, X } from "lucide-react";
import {
  type Bundle,
  type Category,
  CATEGORY_LABELS,
  referenceOf,
} from "@/domain/model";
import { createQuickTry, saveDraft } from "@/domain/browser";
import { reviseQuickTry } from "@/domain/quick-revision";
import { Photo } from "./photo";

export function QuickEdit({
  bundle,
  onClose,
  onSave,
}: {
  bundle: Bundle;
  onClose: () => void;
  onSave: (bundle: Bundle) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(bundle.item.title);
  const [category, setCategory] = useState<Category>(bundle.item.category);
  const [replacement, setReplacement] = useState<Bundle>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    element.showModal();
    return () => {
      element.close();
      opener?.focus();
    };
  }, []);
  const shown = replacement || bundle;
  const photo = referenceOf(shown.item);
  return (
    <dialog
      ref={dialog}
      className="quick-edit-dialog"
      aria-label="Edit your piece."
      onClose={() => {
        // StrictMode can queue the cleanup close event after reopening.
        if (!dialog.current?.open) onClose();
      }}
      onCancel={(e) => {
        if (lock.current) e.preventDefault();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (lock.current) return;
          lock.current = true;
          setBusy(true);
          setError("");
          void (async () => {
            const next = await reviseQuickTry(bundle, {
              title,
              category,
              replacement,
            });
            await saveDraft(next);
            onSave(next);
            onClose();
          })()
            .catch((e) =>
              setError(
                e instanceof Error
                  ? e.message
                  : "The piece could not be updated.",
              ),
            )
            .finally(() => {
              lock.current = false;
              setBusy(false);
            });
        }}
      >
        <div className="section-line">
          <h2 id="quick-edit-title">Edit your piece.</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close piece editor"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <Photo
          bytes={shown.assets[photo.id]}
          mime={photo.mime}
          alt="Garment reference selected for this revision"
          className="quick-edit-photo"
        />
        <label>
          Name
          <input
            value={title}
            required
            maxLength={120}
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label htmlFor="quick-piece-category">Category</label>
        <select
          id="quick-piece-category"
          value={category}
          disabled={busy}
          onChange={(e) => setCategory(e.target.value as Category)}
        >
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <label className="button secondary quick-replace">
          <Upload size={17} />
          Replace garment photo
          <input
            type="file"
            aria-label="Replace garment photo"
            accept="image/jpeg,image/png"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file || lock.current) return;
              lock.current = true;
              setBusy(true);
              setError("");
              void createQuickTry(file, category, title)
                .then(setReplacement)
                .catch((e) =>
                  setError(
                    e instanceof Error ? e.message : "Photo could not be read.",
                  ),
                )
                .finally(() => {
                  lock.current = false;
                  setBusy(false);
                });
            }}
          />
        </label>
        <p>
          Changing the photo or category clears its old preview. No generation
          starts here.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="button primary wide" disabled={busy}>
          {busy ? "Preparing…" : "Save piece"}
          <ArrowRight size={17} />
        </button>
      </form>
    </dialog>
  );
}
