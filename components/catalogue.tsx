"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
export const EXAMPLES = [
  {
    slug: "linen-shirt",
    itemId: "sample-rust-linen",
    title: "The rust linen shirt",
    material: "Linen / a little cuff wear",
    detail: "One disclosed detail. A closer look at what matters to you.",
    image: "/samples/reference.jpg",
    archive: "/samples/linen-shirt.asshown.zip",
    number: "01",
    price: "₹1,400",
  },
  {
    slug: "navy-knit",
    itemId: "sample-navy-knit",
    title: "The navy cable knit",
    material: "Cotton / a loose hem stitch",
    detail: "Dense texture, a small loose thread, and the question of repair.",
    image: "/samples/navy-knit/reference.jpg",
    archive: "/samples/navy-knit/item.asshown.zip",
    number: "02",
    price: "₹1,800",
  },
  {
    slug: "ivory-shirt",
    itemId: "sample-ivory-shirt",
    title: "The ivory silk shirt",
    material: "Silk / faint cuff discoloration",
    detail: "A subtle mark that deserves its own photograph and decision.",
    image: "/samples/ivory-shirt/reference.jpg",
    archive: "/samples/ivory-shirt/item.asshown.zip",
    number: "03",
    price: "₹2,200",
  },
] as const;
export function Catalogue({
  storefront = false,
  onOpen,
}: {
  storefront?: boolean;
  onOpen: (slug: string) => void;
}) {
  return (
    <section className="collection-page">
      <div className="collection-heading">
        <span className="eyebrow">
          {storefront
            ? "A DEMONSTRATION STOREFRONT"
            : "THE INSPECTION COLLECTION"}
        </span>
        <h1>
          {storefront ? (
            <>
              A little more
              <br />
              <em>before you buy.</em>
            </>
          ) : (
            <>
              Three pieces.
              <br />
              <em>A closer look.</em>
            </>
          )}
        </h1>
        <p>
          {storefront
            ? "A merchant can connect an item page to its condition record and YouCam preview. These fictional listings demonstrate the handoff; no purchases are available."
            : "Explore actual recorded YouCam outputs, inspect the original synthetic source photos, and decide what you would ask a seller."}
        </p>
      </div>
      <div className="collection-grid">
        {EXAMPLES.map((item) => (
          <article className="collection-card" key={item.slug}>
            <button
              className="collection-image"
              aria-label={"Inspect " + item.title}
              onClick={() => onOpen(item.slug)}
            >
              <img
                src={item.image}
                alt={"Synthetic source photograph: " + item.title}
                width={800}
                height={1200}
                loading="lazy"
              />
              <span className="collection-number">CASE / {item.number}</span>
              <span className="collection-image-action">
                Take a closer look <ArrowUpRight size={20} />
              </span>
            </button>
            <div className="section-line">
              <span className="eyebrow">{item.material}</span>
              {storefront && <span>{item.price} / fictional</span>}
            </div>
            <h2>{item.title}</h2>
            <p>{item.detail}</p>
            <button className="text-button" onClick={() => onOpen(item.slug)}>
              {storefront
                ? "Inspect condition & try on"
                : "Open the inspection"}
              <ArrowUpRight size={16} />
            </button>
            <Link className="sample-permalink" href={"/examples/" + item.slug}>
              Open example link
            </Link>
          </article>
        ))}
      </div>
      <p className="collection-note">
        All garments, source photographs and people in this collection are
        synthetic demonstrations. Each recorded style preview is an actual
        YouCam output. No real listing or customer outcome is represented.
      </p>
      {storefront ? (
        <div className="merchant-note">
          <h2>A handoff that keeps the details.</h2>
          <p>
            Item page → exact source record → personal style preview → reviewed
            disclosures → saved decision. A production merchant integration
            requires authorized catalog data and the merchant’s approval.
          </p>
          <Link href="/evidence">
            Read the integration contract <ArrowUpRight size={16} />
          </Link>
        </div>
      ) : (
        <Link className="text-button" href="/storefront">
          See the merchant handoff <ArrowUpRight size={16} />
        </Link>
      )}
    </section>
  );
}
