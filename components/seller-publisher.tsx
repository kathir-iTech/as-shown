"use client";
import { useEffect, useRef, useState } from "react";
import { Copy, Link2, ArrowUpRight } from "lucide-react";
import { type Bundle } from "@/domain/model";
import { savePackage } from "@/domain/archive-client";
import { getLocal, putLocal } from "@/domain/browser";
type Receipt = {
  id: string;
  revision: number;
  readToken: string;
  manageToken: string;
  expiresAt: number;
};
export function SellerPublisher({ bundle }: { bundle: Bundle }) {
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt>();
  const [message, setMessage] = useState("");
  const [enabled, setEnabled] = useState(false);
  const lock = useRef(false);
  const storageKey = "publication:" + bundle.item.contentDigest;
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/health")
      .then((r) => r.json())
      .then((state) => {
        if (!cancelled) setEnabled(state.sharingEnabled === true);
      })
      .catch(() => {});
    void getLocal<{ receipt?: Receipt }>(storageKey)
      .then((saved) => {
        if (
          !cancelled &&
          saved?.receipt &&
          saved.receipt.expiresAt > Date.now()
        )
          setReceipt(saved.receipt);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [storageKey]);
  async function publish() {
    if (!consent || lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("Preparing the seller-only record…");
    try {
      const previous = await getLocal<{ intent: string; receipt?: Receipt }>(
        storageKey,
      );
      const intent = previous?.intent || crypto.randomUUID();
      await putLocal(storageKey, { intent });
      const bytes = await savePackage(bundle, "item");
      if (bytes.length > 3_500_000)
        throw new Error(
          "This record is larger than the 3.5 MB hosted-link limit. Export the seller package or use smaller source photos in a new revision.",
        );
      const session = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!session.ok)
        throw new Error("A publication session could not be prepared.");
      setMessage("Creating a private, expiring seller copy…");
      const response = await fetch("/api/share/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/zip",
          "Idempotency-Key": intent,
          "X-AsShown-Publication-Consent": "seller-copy-2026-10-21",
        },
        body: new Blob([new Uint8Array(bytes)], { type: "application/zip" }),
        signal: AbortSignal.timeout(100000),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.message ||
            "Publication could not be confirmed. Check this same request later.",
        );
      setReceipt(result);
      await putLocal(storageKey, { intent, receipt: result });
      setMessage(
        "Seller copy ready. Buyer notes and personal previews were excluded.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Publication could not be confirmed. No automatic retry was made.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const readUrl =
    receipt && typeof window !== "undefined"
      ? `${window.location.origin}/share/${receipt.id}#${receipt.readToken}`
      : "";
  const manageUrl =
    receipt && typeof window !== "undefined"
      ? `${window.location.origin}/manage/${receipt.id}#${receipt.manageToken}`
      : "";
  return (
    <section className="publisher-panel">
      <div>
        <span className="eyebrow">
          <Link2 size={15} /> THE SELLER’S HANDOFF
        </span>
        <h2>A link to the details.</h2>
        <p>
          Publish an expiring seller copy for someone to inspect on another
          device.
        </p>
      </div>
      <div>
        {receipt ? (
          <>
            <label>
              Seller inspection link
              <input value={readUrl} readOnly />
            </label>
            <div className="message-actions">
              <button
                className="button secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(readUrl);
                    setMessage("Seller link copied.");
                  } catch {
                    setMessage("Select and copy the link above.");
                  }
                }}
              >
                <Copy size={16} /> Copy seller link
              </button>
              <a
                className="text-button"
                href={readUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open published copy <ArrowUpRight size={16} />
              </a>
            </div>
            <p className="small">
              Published revision {receipt.revision} · expires{" "}
              {new Date(receipt.expiresAt).toLocaleString()}. The metadata-free
              copy is a separate revision.
            </p>
            <a
              className="text-button"
              href={manageUrl}
              target="_blank"
              rel="noreferrer"
            >
              Private revocation link <ArrowUpRight size={15} />
            </a>
            <p className="small">
              Keep the revocation link private. Anyone with the inspection link
              can download a copy; revocation cannot erase their download.
            </p>
          </>
        ) : (
          <>
            <label className="check-label">
              <input
                type="checkbox"
                checked={consent}
                disabled={busy || !enabled}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                I have permission to publish these seller photographs. Create a
                new metadata-free revision available to link recipients for 24
                hours. Exclude buyer notes and personal previews.
              </span>
            </label>
            <button
              className="button secondary"
              disabled={!consent || busy || !enabled}
              onClick={() => void publish()}
            >
              <Link2 size={16} />
              {busy ? "Preparing seller link…" : "Publish seller-only link"}
            </button>
            <p className="small">
              3.5 MB maximum. Free hosting quotas apply.{" "}
              {enabled
                ? "Expired copies are removed by daily cleanup."
                : "Hosted links are paused here; the seller package still works."}
            </p>
          </>
        )}
        {message && (
          <p role="status" className="publisher-status">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
