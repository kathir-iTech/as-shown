"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  FileArchive,
  Focus,
  Layers3,
  ScanLine,
} from "lucide-react";

const lenses = [
  {
    label: "The silhouette",
    title: "Imagine the style.",
    text: "A real, recorded YouCam result. Useful for imagining an outfit; never a guarantee of fit.",
    image: "preview",
    tag: "YOUCAM · GENERATED",
  },
  {
    label: "The garment",
    title: "Meet the original.",
    text: "The exact reference used for the preview. Original front and back photos live in the item record.",
    image: "reference",
    tag: "SOURCE · UNCHANGED",
  },
  {
    label: "The detail",
    title: "Look a little closer.",
    text: "A declared cuff issue, linked to its source. You decide whether it works for you.",
    image: "cuff",
    tag: "CONDITION · SELLER DECLARED",
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
  const stage = useRef<HTMLDivElement>(null);
  const selected = lenses[lens];
  return (
    <>
      <section className="studio-hero">
        <div className="hero-kicker">
          <span className="live-dot" /> A SECONDHAND INSPECTION STUDIO{" "}
          <span>EST. 2026 / EXPERIMENT 001</span>
        </div>
        <div className="studio-heading">
          <h1>
            Worth a<br />
            <span>second look.</span>
            <span className="heading-asterisk" aria-hidden="true">
              ✳
            </span>
          </h1>
          <div className="hero-aside">
            <span className="eyebrow">GOOD STYLE HAS A BACKSTORY.</span>
            <p>
              Try on the look.
              <br />
              Get closer to the condition.
              <br />
              Keep the record that matters.
            </p>
            <button
              className="button primary"
              onClick={onExplore}
              disabled={busy}
              aria-label="Explore the completed example"
            >
              Enter the inspection studio <ArrowUpRight size={19} />
            </button>
            <button className="text-button" onClick={onLive} disabled={busy}>
              Try a live preview <ArrowRight size={16} />
            </button>
          </div>
        </div>
        <div
          className="studio-stage"
          ref={stage}
          onPointerMove={(event) => {
            if (
              event.pointerType !== "mouse" ||
              window.matchMedia("(prefers-reduced-motion: reduce)").matches
            )
              return;
            const rect = event.currentTarget.getBoundingClientRect();
            stage.current?.style.setProperty(
              "--pointer-x",
              `${((event.clientX - rect.left) / rect.width - 0.5) * 8}deg`,
            );
            stage.current?.style.setProperty(
              "--pointer-y",
              `${((event.clientY - rect.top) / rect.height - 0.5) * -5}deg`,
            );
          }}
          onPointerLeave={() => {
            stage.current?.style.setProperty("--pointer-x", "0deg");
            stage.current?.style.setProperty("--pointer-y", "0deg");
          }}
        >
          <div className="stage-grid" aria-hidden="true" />
          <div className="stage-index">
            <span>CASE / 001</span>
            <span>THE RUST LINEN SHIRT</span>
          </div>
          <div className="stage-annotations">
            <span className="annotation-rule" />
            <span className="eyebrow">
              ONE ITEM.
              <br />
              THREE WAYS TO LOOK.
            </span>
            <p>Every image has a different job.</p>
            <div
              className="lens-controls"
              aria-label="Explore the sample views"
            >
              {lenses.map((item, index) => (
                <button
                  key={item.image}
                  aria-pressed={index === lens}
                  onClick={() => setLens(index)}
                >
                  <span>0{index + 1}</span>
                  {item.label}
                  <ArrowUpRight size={15} />
                </button>
              ))}
            </div>
          </div>
          <div className="stage-images">
            <div className="floating-reference">
              <span>01 / SOURCE FILE</span>
              <img
                src="/samples/reference.jpg"
                alt="Synthetic rust linen shirt source reference"
                width="800"
                height="1200"
              />
              <span className="file-caption">
                <Layers3 size={13} /> ORIGINAL REFERENCE
              </span>
            </div>
            <div
              className={"stage-main lens-" + selected.image}
              key={selected.image}
            >
              <img
                src={`/samples/${selected.image}.jpg`}
                alt={selected.text}
                fetchPriority="high"
                width="800"
                height="1200"
              />
              <span className="image-badge">
                <span className="live-dot" /> {selected.tag}
              </span>
              <span className="frame-corner top-left" />
              <span className="frame-corner bottom-right" />
            </div>
            <button
              className="detail-card"
              onClick={() => setLens(2)}
              aria-label="Focus on the declared cuff detail"
            >
              <img
                src="/samples/cuff.jpg"
                alt="Synthetic close-up of a frayed cuff"
                width="200"
                height="200"
              />
              <span>
                <span className="eyebrow">DETAIL / 01</span>
                <strong>
                  A little wear.
                  <br />A real question.
                </strong>
                <span>
                  Inspect the cuff <ArrowUpRight size={14} />
                </span>
              </span>
            </button>
          </div>
          <div className="stage-caption" aria-live="polite">
            <span>0{lens + 1}</span>
            <div>
              <h2>{selected.title}</h2>
              <p>{selected.text}</p>
            </div>
            <Focus size={25} />
          </div>
        </div>
        <div className="stage-disclosure">
          <span>
            <span className="live-dot" /> ACTUAL YOUCAM OUTPUT
          </span>
          <p>
            Controlled demo: synthetic person, garment and condition photos. No
            real listing. No defect-detection claim.
          </p>
          <a href="#the-idea" aria-label="Read how AsShown works">
            <ArrowDown size={19} />
          </a>
        </div>
        <div className="entry-tools">
          {importControl}
          <span>
            No account. No purchase. Source records stay on your device.
          </span>
        </div>
      </section>

      <section className="idea-section" id="the-idea">
        <div className="section-number">01 / THE MISSING CONTEXT</div>
        <div className="idea-editorial">
          <h2>
            The photo you like.
            <br />
            <span>The details you need.</span>
          </h2>
          <p>
            For a secondhand piece, seeing yourself wearing it is only part of
            the decision. AsShown gives the original condition photos their own
            space beside the generated style image.
          </p>
        </div>
        <div className="method-grid">
          <article>
            <Layers3 size={28} />
            <span className="eyebrow">01 / RECORD</span>
            <h3>
              Every side,
              <br />
              accounted for.
            </h3>
            <p>
              Reference, front, back, declared issues and close-ups. Each edit
              creates a new revision, so an old review never silently applies to
              a changed item.
            </p>
            <button className="text-button" onClick={onCreate}>
              Create an item record <ArrowUpRight size={16} />
            </button>
          </article>
          <article>
            <ScanLine size={28} />
            <span className="eyebrow">02 / INSPECT</span>
            <h3>
              Style together.
              <br />
              Evidence apart.
            </h3>
            <p>
              Explore a real YouCam try-on. Open source details, locate
              seller-marked regions, and make your own choice about every
              declared issue.
            </p>
            <button className="text-button" onClick={onExplore}>
              Open the worked example <ArrowUpRight size={16} />
            </button>
          </article>
          <article>
            <FileArchive size={28} />
            <span className="eyebrow">03 / KEEP</span>
            <h3>
              A decision,
              <br />
              with its context.
            </h3>
            <p>
              Build a seller question list and download your private record:
              actual image files, your review and an offline viewer. No
              disappearing image links.
            </p>
            <span className="method-note">Your notes stay yours.</span>
          </article>
        </div>
      </section>
      <section className="closing-statement">
        <span className="eyebrow">A MORE CONSIDERED WAY TO LOOK</span>
        <h2>
          Before you fall for it,
          <br />
          get the whole picture.
        </h2>
        <button className="button primary" onClick={onExplore} disabled={busy}>
          Take a closer look <ArrowUpRight size={19} />
        </button>
        <p>
          A working prototype for shirts and tops. No sizing, authentication or
          condition guarantees.
        </p>
      </section>
    </>
  );
}
