"use client";
import { useEffect, useState } from "react";
import { useEffectEvent } from "react";
import { type Bundle } from "@/domain/model";
import { openPackage } from "@/domain/archive-client";
export function SharedRecord({
  id,
  manage,
  onOpen,
}: {
  id: string;
  manage: boolean;
  onOpen: (bundle: Bundle) => void;
}) {
  const [token, setToken] = useState("");
  const [message, setMessage] = useState(
    manage
      ? "Keep this revocation link private."
      : "Opening the seller’s record…",
  );
  const [busy, setBusy] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const opened = useEffectEvent(onOpen);
  useEffect(() => {
    let cancelled = false;
    const capability = window.location.hash.slice(1);
    setToken(capability);
    if (!capability || !/^[A-Za-z0-9_-]{40,90}$/.test(capability)) {
      setMessage(
        "This link is incomplete. Ask the seller for its full link or exported package.",
      );
      return;
    }
    if (manage) return;
    void (async () => {
      try {
        const response = await fetch("/api/share/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, token: capability }),
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(
            error.message || "This seller record is unavailable.",
          );
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length > 3_500_000)
          throw new Error("The published record exceeds the hosted limit.");
        const bundle = await openPackage(bytes);
        if (!cancelled) opened(bundle);
      } catch (error) {
        if (!cancelled)
          setMessage(
            error instanceof Error
              ? error.message
              : "The seller record could not be opened.",
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, manage]);
  return (
    <section className="empty-record">
      <span className="eyebrow">
        {manage ? "PUBLICATION MANAGEMENT" : "SHARED SELLER RECORD"}
      </span>
      <h1>
        {manage
          ? "Your link.<br />Your control.".split("<br />").map((text, i) => (
              <span key={text}>
                {i > 0 && <br />}
                {text}
              </span>
            ))
          : "A closer look is coming."}
      </h1>
      <p role="status">{message}</p>
      {manage && (
        <>
          <p>
            Revocation stops future access through this link. Previously
            downloaded copies remain with their recipients.
          </p>
          <button
            className="button primary"
            disabled={!token || busy || revoked}
            onClick={async () => {
              setBusy(true);
              try {
                const response = await fetch("/api/share/revoke", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id, token }),
                });
                const result = await response.json();
                if (!response.ok)
                  throw new Error(
                    result.message || "Revocation could not be confirmed.",
                  );
                setRevoked(true);
                setMessage(
                  result.fileDeletionPending
                    ? "Link revoked. Stored-file deletion is pending cleanup."
                    : "Link revoked and the stored file was deleted.",
                );
              } catch (error) {
                setMessage(
                  error instanceof Error
                    ? error.message
                    : "Revocation could not be confirmed.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {revoked
              ? "Seller link revoked"
              : busy
                ? "Revoking…"
                : "Revoke this seller link"}
          </button>
        </>
      )}
    </section>
  );
}
