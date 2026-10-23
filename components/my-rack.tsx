"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  Copy,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { CATEGORY_LABELS, type Bundle } from "@/domain/model";
import {
  listRack,
  removeRackRecord,
  saveRackMeta,
  type RackEntry,
  type RackMeta,
  type RackStatus,
  getLocal,
} from "@/domain/browser";
import { Photo } from "./photo";

export function useRack() {
  const [rack, setRack] = useState<RackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    let revision = 0;
    const load = () => {
      const current = ++revision;
      void listRack()
        .then((rows) => {
          if (!cancelled && current === revision) {
            setRack(rows);
            setLoading(false);
            setError("");
          }
        })
        .catch(() => {
          if (!cancelled) {
            setError(
              "Device storage is unavailable. You can still use the fitting room and export a package.",
            );
            setLoading(false);
          }
        });
    };
    load();
    window.addEventListener("asshown:rack", load);
    return () => {
      cancelled = true;
      window.removeEventListener("asshown:rack", load);
    };
  }, []);
  return { rack, loading, error };
}
function thumbnail(bundle: Bundle) {
  return bundle.item.assets.find((a) => a.role === "reference")!;
}
export function RackRail({
  current,
  onOpen,
}: {
  current: string;
  onOpen: (bundle: Bundle) => void;
}) {
  const { rack } = useRack();
  return (
    <aside className="rack-rail" aria-label="Switch between your items">
      <Link className="rail-add" href="/try">
        <Plus size={23} />
        <span>Add a piece</span>
      </Link>
      <div className="rail-items">
        {rack.map(({ bundle, savedLook }) => {
          const photo = thumbnail(bundle);
          return (
            <button
              key={bundle.item.itemId}
              className={current === bundle.item.itemId ? "selected" : ""}
              onClick={() => onOpen(bundle)}
              aria-current={current === bundle.item.itemId ? "true" : undefined}
              aria-label={"Open " + bundle.item.title}
            >
              <Photo bytes={bundle.assets[photo.id]} mime={photo.mime} alt="" />
              <span>{bundle.item.title}</span>
              {savedLook && <Check size={13} />}
            </button>
          );
        })}
      </div>
      <Link className="text-button rail-all" href="/rack">
        My rack <ArrowUpRight size={15} />
      </Link>
    </aside>
  );
}
export function MyRack({
  onOpen,
  onCreate,
  onRemoved,
}: {
  onOpen: (bundle: Bundle) => void;
  onCreate: () => void;
  onRemoved: (id: string) => void;
}) {
  const { rack, loading, error } = useRack();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [collection, setCollection] = useState("all");
  const [notice, setNotice] = useState("");
  const [removing, setRemoving] = useState<string>();
  const [selected, setSelected] = useState<string[]>([]);
  const [collectionUrl, setCollectionUrl] = useState("");
  const collections = [
    ...new Set(rack.map((r) => r.meta.collection).filter(Boolean)),
  ];
  const visible = rack.filter(
    ({ bundle, meta }) =>
      (category === "all" || bundle.item.category === category) &&
      (status === "all" || status === meta.status) &&
      (collection === "all" || collection === meta.collection) &&
      bundle.item.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  async function update(entry: RackEntry, changes: Partial<RackMeta>) {
    try {
      await saveRackMeta(entry.bundle.item.itemId, {
        ...entry.meta,
        ...changes,
      });
    } catch {
      setNotice("The change could not be saved on this device.");
    }
  }
  async function move(id: string, direction: -1 | 1) {
    const index = rack.findIndex((entry) => entry.bundle.item.itemId === id);
    if (index < 0 || !rack[index + direction]) return;
    const ordered = [...rack];
    [ordered[index], ordered[index + direction]] = [
      ordered[index + direction],
      ordered[index],
    ];
    try {
      await Promise.all(
        ordered.map((entry, order) =>
          saveRackMeta(entry.bundle.item.itemId, { ...entry.meta, order }),
        ),
      );
    } catch {
      setNotice("The order could not be saved.");
    }
  }
  async function shareCollection() {
    setCollectionUrl("");
    try {
      const links = [];
      for (const entry of rack.filter((e) =>
        selected.includes(e.bundle.item.itemId),
      )) {
        if (entry.bundle.item.declaration === "not-supplied")
          throw new Error(
            "Collections can share seller records only, never Quick Try references or personal looks.",
          );
        const publication = await getLocal<{
          receipt?: { id: string; readToken: string; expiresAt: number };
        }>("publication:" + entry.bundle.item.contentDigest);
        const receipt = publication?.receipt;
        if (!receipt || receipt.expiresAt <= Date.now())
          throw new Error(
            "Publish a seller-only link for each selected record first. Open the item and use ‘Publish seller link’. No photos are uploaded by this collection action.",
          );
        links.push({ id: receipt.id, token: receipt.readToken });
      }
      if (!links.length || links.length > 8)
        throw new Error(
          "Choose between one and eight published seller records.",
        );
      const url =
        location.origin +
        "/collection#" +
        encodeURIComponent(JSON.stringify(links));
      setCollectionUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        setNotice(
          "Collection link copied. Anyone with it can open the selected seller copies until each expires or is revoked. Your personal looks and notes are excluded.",
        );
      } catch {
        setNotice(
          "Collection link ready below. Select and copy it manually. Anyone with it can read the selected seller copies while valid; personal looks, notes and revocation controls are excluded.",
        );
      }
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : "The collection link could not be copied. Use individual seller links instead.",
      );
    }
  }
  return (
    <section className="my-rack">
      <div className="rack-heading">
        <div>
          <p>Your pieces. Your point of view.</p>
          <h1>
            My rack<span>{rack.length.toString().padStart(2, "0")}</span>
          </h1>
        </div>
        <Link className="button primary" href="/try">
          <Plus size={19} /> Add a piece
        </Link>
      </div>
      <p className="rack-privacy">
        Saved on this device, not a public shop. Up to 40 pieces / 100 MB of
        source photos. Export anything you want to keep.
      </p>
      <div className="rack-filters">
        <label className="rack-search">
          <Search size={20} />
          <input
            aria-label="Search your rack"
            type="search"
            placeholder="Find that piece…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          Category
          <select
            aria-label="Filter rack category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">All pieces</option>
            {Object.entries(CATEGORY_LABELS).map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Decision
          <select
            aria-label="Filter rack decision"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All decisions</option>
            <option value="considering">Considering</option>
            <option value="shortlisted">Shortlisted</option>
            <option value="passed">Passed</option>
          </select>
        </label>
        <label>
          Collection
          <select
            aria-label="Filter rack collection"
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
          >
            <option value="all">All collections</option>
            {collections.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
      </div>
      {(error || notice) && (
        <p className="status-box" role="status">
          {error || notice}
        </p>
      )}
      {collectionUrl && (
        <label className="collection-link-output">
          Share this seller-only collection
          <input
            aria-label="Seller collection link"
            readOnly
            value={collectionUrl}
            onFocus={(e) => e.target.select()}
          />
        </label>
      )}
      {selected.length > 0 && (
        <div className="rack-selection">
          <span>{selected.length} selected</span>
          <button
            className="button secondary"
            onClick={() => void shareCollection()}
          >
            <Copy size={17} /> Copy seller collection link
          </button>
          <button
            className="icon-button"
            aria-label="Clear selection"
            onClick={() => setSelected([])}
          >
            <X size={18} />
          </button>
        </div>
      )}
      {loading ? (
        <p role="status">Opening your rack…</p>
      ) : !visible.length ? (
        <div className="rack-empty">
          <span aria-hidden="true">↗</span>
          <h2>
            {rack.length
              ? "No matches. Keep looking."
              : "Start with the piece you found."}
          </h2>
          <p>
            {rack.length
              ? "Try another filter or search."
              : "A jacket from a friend. A dress from a resale listing. Bring an image you’re allowed to use—this is your rack, not our three demos."}
          </p>
          <Link className="button primary" href="/try">
            Try my item <ArrowUpRight size={19} />
          </Link>
          <button className="text-button" onClick={onCreate}>
            Create a seller record instead
          </button>
        </div>
      ) : (
        <div className="rack-grid">
          {visible.map((entry) => {
            const { bundle, meta, savedLook } = entry;
            const photo = thumbnail(bundle);
            const id = bundle.item.itemId;
            return (
              <article className="rack-card" key={id}>
                <div className="rack-image">
                  <button
                    className="rack-open"
                    onClick={() => onOpen(bundle)}
                    aria-label={"Open " + bundle.item.title}
                  >
                    <Photo
                      bytes={bundle.assets[photo.id]}
                      mime={photo.mime}
                      alt={bundle.item.title}
                    />
                    <span>
                      Step into the fitting room <ArrowUpRight size={20} />
                    </span>
                  </button>
                  <label className="rack-select">
                    <input
                      type="checkbox"
                      aria-label={"Select " + bundle.item.title}
                      checked={selected.includes(id)}
                      onChange={(e) =>
                        setSelected((s) =>
                          e.target.checked
                            ? [...s, id]
                            : s.filter((x) => x !== id),
                        )
                      }
                    />
                  </label>
                  <span className="rack-kind">
                    {bundle.item.assets.some(
                      (a) => a.origin === "synthetic-demo",
                    )
                      ? "Demo"
                      : bundle.item.declaration === "not-supplied"
                        ? "Your find"
                        : "Seller record"}
                  </span>
                  {savedLook && (
                    <span className="rack-saved-look">
                      Look saved on device
                    </span>
                  )}
                </div>
                <div className="rack-card-title">
                  <h2>{bundle.item.title}</h2>
                  <button
                    className="icon-button"
                    aria-label={"Remove " + bundle.item.title}
                    onClick={() => setRemoving(id)}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
                <p>{CATEGORY_LABELS[bundle.item.category]}</p>
                <label className="rack-decision">
                  Your decision
                  <select
                    aria-label={"Decision for " + bundle.item.title}
                    value={meta.status}
                    onChange={(e) =>
                      void update(entry, {
                        status: e.target.value as RackStatus,
                      })
                    }
                  >
                    <option value="considering">Considering</option>
                    <option value="shortlisted">Shortlisted</option>
                    <option value="passed">Passed</option>
                  </select>
                </label>
                <label className="rack-collection">
                  Collection
                  <input
                    aria-label={"Collection for " + bundle.item.title}
                    maxLength={60}
                    defaultValue={meta.collection}
                    placeholder="e.g. Weekend finds"
                    onBlur={(e) => {
                      if (e.target.value !== meta.collection)
                        void update(entry, { collection: e.target.value });
                    }}
                  />
                </label>
                <div className="rack-reorder">
                  <span>Move on your rack</span>
                  <button
                    aria-label={"Move " + bundle.item.title + " earlier"}
                    disabled={rack[0] === entry}
                    onClick={() => void move(id, -1)}
                  >
                    <ArrowUp size={18} />
                  </button>
                  <button
                    aria-label={"Move " + bundle.item.title + " later"}
                    disabled={rack[rack.length - 1] === entry}
                    onClick={() => void move(id, 1)}
                  >
                    <ArrowDown size={18} />
                  </button>
                </div>
                {removing === id && (
                  <div
                    className="rack-delete"
                    role="group"
                    aria-label="Confirm removal"
                  >
                    <p>
                      Remove this item, notes, saved look and recovery tokens
                      from this device? Downloads and published links remain.
                    </p>
                    <button
                      className="button primary"
                      onClick={() => {
                        void removeRackRecord(id)
                          .then(() => {
                            setRemoving(undefined);
                            onRemoved(id);
                            setSelected((s) => s.filter((x) => x !== id));
                          })
                          .catch(() =>
                            setNotice("Removal failed. Please try again."),
                          );
                      }}
                    >
                      Remove from device
                    </button>
                    <button
                      className="text-button"
                      onClick={() => setRemoving(undefined)}
                    >
                      Keep it
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
