"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Focus } from "lucide-react";
const lenses = [
  {
    label: "The silhouette",
    image: "reference",
    title: "The style you imagine. The garment you inspect.",
    tag: "ORIGINAL REFERENCE",
  },
  {
    label: "The garment",
    image: "front",
    title: "Its original photographs stay in the picture.",
    tag: "ORIGINAL FRONT VIEW",
  },
  {
    label: "The detail",
    image: "cuff",
    title: "A little wear. A question worth asking.",
    tag: "SELLER-DISCLOSED CUFF DETAIL",
  },
];
export function StudioLanding({
  busy,
  onExplore,
  onLive,
  onCreate,
  importControl,
}: {
  busy: boolean;
  onExplore: () => void;
  onLive: () => void;
  onCreate: () => void;
  importControl: ReactNode;
}) {
  const [lens, setLens] = useState(0);
  const selected = lenses[lens];
  return (
    <>
      <section className="decision-hero">
        <div className="hero-overline">
          <span>
            <i className="live-dot" /> SECONDHAND / CONSIDERED
          </span>
          <span>YOUR NEXT FAVOURITE, IN CONTEXT.</span>
        </div>
        <div className="decision-hero-heading">
          <h1>
            Try it on.
            <br />
            <em>Look closer.</em>
            <sup>✳</sup>
          </h1>
          <div>
            <p>
              A real YouCam style preview.
              <br />
              The original condition photographs.
              <br />
              One decision, with the whole story.
            </p>
            <button
              className="button primary"
              aria-label="Explore the completed example"
              onClick={onExplore}
              disabled={busy}
            >
              Enter the inspection studio <ArrowUpRight size={19} />
            </button>
            <button className="text-button" onClick={onLive} disabled={busy}>
              Try a live preview <ArrowRight size={16} />
            </button>
          </div>
        </div>
        <div className="hero-inspection-board">
          <div className="board-caption">
            <span>CASE 001 / THE RUST LINEN SHIRT</span>
            <span>
              <Focus size={14} /> TWO VIEWS, ONE CONSIDERED DECISION
            </span>
          </div>
          <div className="hero-comparison">
            <div className="hero-style-frame">
              <span className="frame-overline">01 / SEE THE STYLE</span>
              <img
                src="/samples/preview.jpg"
                alt="Actual recorded YouCam output depicting a synthetic adult in the rust linen shirt"
                width={800}
                height={1200}
                fetchPriority="high"
              />
              <span className="persistent-image-label">
                AI STYLE PREVIEW · ACTUAL YOUCAM OUTPUT
              </span>
            </div>
            <div className={"hero-evidence-frame lens-" + selected.image}>
              <span className="frame-overline">02 / KEEP THE DETAILS</span>
              <img
                src={"/samples/" + selected.image + ".jpg"}
                alt={selected.tag + " of the fictional rust linen shirt"}
                width={800}
                height={1200}
              />
              <span className="persistent-image-label source-label">
                {selected.tag}
              </span>
              {lens !== 2 && (
                <button
                  className="hero-detail-pin"
                  onClick={() => setLens(2)}
                  aria-label="Focus on the declared cuff detail"
                >
                  <span>01</span>
                  <span>
                    A little cuff wear
                    <br />
                    <b>Take a closer look ↗</b>
                  </span>
                </button>
              )}
            </div>
          </div>
          <div className="board-bottom">
            <div className="hero-lenses" aria-label="Explore the sample views">
              {lenses.map((item, index) => (
                <button
                  key={item.image}
                  aria-pressed={lens === index}
                  onClick={() => setLens(index)}
                >
                  <span>0{index + 1}</span>
                  {item.label}
                  <ArrowUpRight size={14} />
                </button>
              ))}
            </div>
            <p aria-live="polite">{selected.title}</p>
            <button
              className="board-open"
              onClick={onExplore}
              aria-label="Open this item record"
            >
              <ArrowUpRight size={23} />
            </button>
          </div>
        </div>
        <div className="hero-footnote">
          <span>
            Synthetic demonstration photographs. Actual recorded YouCam result.
          </span>
          <a href="#the-idea" aria-label="Read how AsShown works">
            <ArrowDown size={18} />
          </a>
        </div>
        <div className="entry-tools">
          {importControl}
          <span>Explore without an account or personal photograph.</span>
        </div>
      </section>
      <section className="journey-section" id="the-idea">
        <span className="eyebrow">
          THE GOOD PART OF SECONDHAND? THE DETAILS.
        </span>
        <div className="journey-heading">
          <h2>
            Fall for the style.
            <br />
            <em>Stay for the story.</em>
          </h2>
          <p>
            Seeing yourself in a secondhand piece is one part of the decision.
            AsShown gives the original photographs, disclosed wear and
            unanswered questions their own space beside the generated image.
          </p>
        </div>
        <div className="journey-grid">
          <article>
            <span>01 / THE SELLER</span>
            <h3>
              Give the garment
              <br />a clear record.
            </h3>
            <p>
              Add its photographs. Show what a buyer should know. Keep each
              revision together.
            </p>
            <button className="text-button" onClick={onCreate}>
              Create a record <ArrowUpRight size={16} />
            </button>
          </article>
          <article>
            <span>02 / THE BUYER</span>
            <h3>
              See the look.
              <br />
              Inspect the detail.
            </h3>
            <p>
              Compare a personalized YouCam preview with source evidence, then
              decide what works for you.
            </p>
            <button className="text-button" onClick={onExplore}>
              Explore the inspection <ArrowUpRight size={16} />
            </button>
          </article>
          <article>
            <span>03 / YOUR DECISION</span>
            <h3>
              Keep what
              <br />
              you reviewed.
            </h3>
            <p>
              Save the actual photographs, your questions and the precise item
              revision in a record you can reopen.
            </p>
            <Link className="text-button" href="/examples">
              Meet the collection <ArrowUpRight size={16} />
            </Link>
          </article>
        </div>
      </section>
      <section className="collection-teaser">
        <div>
          <span className="eyebrow">
            A SMALL COLLECTION. A FEW BIG QUESTIONS.
          </span>
          <h2>
            Every piece has
            <br />
            <em>something to show.</em>
          </h2>
          <Link className="button primary" href="/examples">
            Explore three garments <ArrowUpRight size={18} />
          </Link>
        </div>
        <div className="teaser-images">
          <Link href="/examples/navy-knit">
            <img
              src="/samples/navy-knit/reference.jpg"
              alt="Synthetic navy cable-knit sweater"
              width={600}
              height={900}
              loading="lazy"
            />
            <span>02 / THE NAVY KNIT ↗</span>
          </Link>
          <Link href="/examples/ivory-shirt">
            <img
              src="/samples/ivory-shirt/reference.jpg"
              alt="Synthetic ivory silk shirt"
              width={600}
              height={900}
              loading="lazy"
            />
            <span>03 / THE IVORY SHIRT ↗</span>
          </Link>
        </div>
      </section>
    </>
  );
}
