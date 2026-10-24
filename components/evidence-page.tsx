import Link from "next/link";
export function EvidencePage() {
  return (
    <article className="privacy-page evidence-page">
      <span className="eyebrow">THE WORK BEHIND THE EXPERIENCE</span>
      <h1>
        A record
        <br />
        you can inspect.
      </h1>
      <p>
        As-Shown is an upload-first fitting room for secondhand finds. Try an
        authorized garment photo without inventing a seller inspection, or open
        a complete seller record to keep original condition details beside the
        generated look. Your pieces and decisions belong in your own rack.
      </p>
      <section>
        <h2>Follow one garment through the system</h2>
        <ol>
          <li>
            Quick Try starts with one authorized garment photo and a selected
            category. Condition is explicitly not supplied. Sellers can instead
            add front/back photographs, declarations and linked condition
            close-ups.
          </li>
          <li>
            A separately prepared copy of the reference and an approved shopper
            photo go to YouCam Clothes VTO V3.
          </li>
          <li>
            The buyer sees the style image beside original evidence and records
            their choices.
          </li>
          <li>
            Changes create a new revision. Reusing an unchanged style input
            requires a fresh condition review.
          </li>
          <li>Exports contain actual images and can be opened offline.</li>
          <li>
            My Rack organizes local pieces, questions and decisions. Saving a
            generated likeness on this device requires a separate opt-in; the
            personal input photo is not saved.
          </li>
        </ol>
      </section>
      <section>
        <h2>Reproduce the checks</h2>
        <p>
          Source, setup instructions, automated checks and release evidence are
          public. Routine tests use controlled provider responses and consume no
          YouCam units. Live proof is documented separately with its exact
          scope.
        </p>
        <p>
          <a href="https://github.com/kathir-iTech/as-shown">
            Source and setup instructions
          </a>{" "}
          ·{" "}
          <a href="https://github.com/kathir-iTech/as-shown/actions">
            Automated checks
          </a>{" "}
          ·{" "}
          <a href="https://github.com/kathir-iTech/as-shown/blob/main/docs/RELEASE_EVIDENCE.md">
            Historical release evidence
          </a>
          {" · "}
          <a href="https://github.com/kathir-iTech/as-shown/blob/main/docs/USABILITY_RELEASE.md">
            Focused workflow and current verification
          </a>
        </p>
      </section>
      <section>
        <h2>What file agreement means</h2>
        <p>
          Each source photograph is linked to the supplied record by its digest.
          This detects a changed file relative to that record. It does not
          establish who supplied the record or whether a physical garment
          matches it.
        </p>
        <p>
          A prepared AI input records its source digest and transformations.
          Original evidence remains separate from generated and resized images.
        </p>
      </section>
      <section>
        <h2>Merchant integration contract</h2>
        <p>
          The <Link href="/storefront">owned demo storefront</Link> links each
          fictional listing to a fixed example record. An external merchant
          supplies an authorized seller-only As-Shown archive or a published
          seller-record link. Listing prices, stock and checkout remain with
          that merchant. As-Shown does not scrape marketplaces or claim an
          installed partnership.
        </p>
      </section>
      <section>
        <h2>Current validation boundaries</h2>
        <p>
          Synthetic scenarios demonstrate technical behavior. They do not
          establish real-user usefulness, conversion improvements, garment
          authenticity or fit accuracy. The release evidence identifies which
          tests were performed and which observations remain open.
        </p>
        <Link href="/privacy">Privacy and processing details</Link>
      </section>
    </article>
  );
}
