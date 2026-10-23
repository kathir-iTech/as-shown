"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { ArrowUpRight } from "lucide-react";
import { openPackage } from "@/domain/archive-client";
import { type Bundle } from "@/domain/model";
import { Photo } from "./photo";
const linksSchema = z
  .array(
    z
      .object({
        id: z.string().regex(/^[a-f0-9]{40}$/),
        token: z.string().regex(/^[A-Za-z0-9_-]{40,90}$/),
      })
      .strict(),
  )
  .min(1)
  .max(8);
type CollectionRow = { id: string; bundle?: Bundle; message?: string };
export function SharedCollection({
  onOpen,
}: {
  onOpen: (bundle: Bundle) => void;
}) {
  const [rows, setRows] = useState<CollectionRow[]>([]);
  const [message, setMessage] = useState("Opening the seller collection…");
  const requests = useRef(new Map<string, Promise<Bundle>>());
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (location.hash.length > 10000)
          throw new Error("The collection link is too large.");
        const links = linksSchema.parse(
          JSON.parse(decodeURIComponent(location.hash.slice(1))),
        );
        if (new Set(links.map((l) => l.id)).size !== links.length)
          throw new Error("This collection has duplicate links.");
        setRows(links.map(({ id }) => ({ id })));
        setMessage(
          "Shared seller copies. Each link has its own expiry and revocation.",
        );
        // Sequential bounded reads reuse the existing per-record quota and capability checks.
        for (const link of links) {
          if (cancelled) return;
          let row: CollectionRow;
          try {
            const key = link.id + ":" + link.token;
            let request = requests.current.get(key);
            if (!request) {
              request = (async () => {
                const response = await fetch("/api/share/read", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(link),
                  signal: AbortSignal.timeout(60000),
                });
                if (!response.ok)
                  throw new Error(
                    "This seller copy is unavailable, expired, revoked or quota-limited.",
                  );
                const length = Number(
                  response.headers.get("content-length") || 0,
                );
                if (length > 3_500_000)
                  throw new Error(
                    "The seller copy exceeds the supported size.",
                  );
                const bytes = new Uint8Array(await response.arrayBuffer());
                if (bytes.length > 3_500_000)
                  throw new Error(
                    "The seller copy exceeds the supported size.",
                  );
                const bundle = await openPackage(bytes);
                if (
                  bundle.preview ||
                  bundle.result ||
                  bundle.review.notes ||
                  bundle.item.declaration === "not-supplied"
                )
                  throw new Error("This is not a seller-only record.");
                return bundle;
              })();
              requests.current.set(key, request);
            }
            const bundle = await request;
            row = { id: link.id, bundle };
          } catch (e) {
            row = {
              id: link.id,
              message:
                e instanceof Error
                  ? e.message
                  : "This seller copy could not be opened.",
            };
          }
          if (!cancelled)
            setRows((current) =>
              current.map((r) => (r.id === row.id ? row : r)),
            );
        }
      } catch {
        if (!cancelled)
          setMessage(
            "This collection link is incomplete or invalid. Ask the sender for the full link.",
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <section className="my-rack">
      <h1>A shared rack.</h1>
      <p role="status">{message}</p>
      <p>
        Seller photographs and declarations—not independently inspected. No
        personal try-on images or buyer notes are shared.
      </p>
      <div className="rack-grid">
        {rows.map(({ id, bundle, message: error }) => {
          const asset = bundle?.item.assets.find((a) => a.role === "reference");
          return (
            <article className="rack-card" key={id}>
              {bundle && asset ? (
                <>
                  <button className="rack-open" onClick={() => onOpen(bundle)}>
                    <Photo
                      bytes={bundle.assets[asset.id]}
                      mime={asset.mime}
                      alt={bundle.item.title}
                    />
                    <span>
                      Inspect this piece <ArrowUpRight size={20} />
                    </span>
                  </button>
                  <h2>{bundle.item.title}</h2>
                  <p>{bundle.item.description}</p>
                </>
              ) : (
                <p role="status">{error || "Opening seller copy…"}</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
