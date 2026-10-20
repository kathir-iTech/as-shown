"use client";
export function PrivacyPage({ onHome }: { onHome: () => void }) {
  return (
    <article className="privacy-page">
      <button className="text-button" onClick={onHome}>
        ← Back to the studio
      </button>
      <span className="eyebrow">PRIVACY / PROVENANCE / LIMITS</span>
      <h1>
        A clear view
        <br />
        of the boundaries.
      </h1>
      <section>
        <h2>What stays on your device</h2>
        <p>
          Seller records, condition close-ups and buyer notes are processed in
          your browser. Source drafts are saved in IndexedDB only when you
          choose to save, or when a live preview needs a recoverable record. The
          personal input photo stays in memory. Completed previews are not
          stored in source drafts. Seller-only exports exclude buyer notes and
          generated personal images.
        </p>
        <p>
          There is no AsShown user account, checkout, advertising tracker or
          cloud photo library. This does not mean the host or provider has no
          operational logs.
        </p>
      </section>
      <section>
        <h2>What leaves your device</h2>
        <p>
          After your affirmative approval, your prepared shopper photo and the
          chosen garment reference pass through our server to Perfect Corp.’s
          YouCam API. Condition close-ups and buyer notes are not transmitted.
          The server also receives structural record commitments to bind a task
          to the selected revision; this does not independently verify withheld
          evidence. The API credential stays on the server.
        </p>
        <p>
          The provider’s policy describes USA storage, generally 30-day
          retention with exceptions, and potential facial or biometric
          processing. Clearing AsShown cannot delete provider-held data. We
          cannot guarantee immediate provider deletion.{" "}
          <a
            href="https://www.makeupar.com/perfectbeauty/youcam/privacy-policy-api"
            target="_blank"
            rel="noreferrer"
          >
            Read the provider’s API privacy policy
          </a>
          .
        </p>
      </section>
      <section>
        <h2>Operational protection</h2>
        <p>
          Live generation requires a server ledger. Request records contain
          keyed pseudonymous identifiers, digest commitments and task recovery
          information, expire after 24 hours, and contain no photos, seller
          descriptions or buyer notes. Session and network rate counters expire
          after two hours; network identifiers are keyed hashes, not raw IP
          addresses. A separate aggregate unit counter persists without
          individual request details. Clearing your browser does not remove
          these records.
        </p>
        <p>
          The ledger admits the same request intent only once during its
          retention window and conservatively reserves units even if a request
          fails. Recovery tokens last two hours. If the provider accepted a task
          but its response was lost, the app stops rather than silently creating
          another task; this is not an exactly-once guarantee across independent
          systems.
        </p>
        <p>
          A free-credit reserve and verified pricing checks can pause live
          generation. There is no paid fallback. Provider outages and
          free-service limits can still interrupt a preview. A completed offline
          package remains usable.
        </p>
      </section>
      <section>
        <h2>What the app cannot verify</h2>
        <p>
          A generated image can change drape, sleeve placement, texture, marks
          and body proportions. It is not a sizing recommendation, fit
          guarantee, condition inspection or authentication. Seller claims can
          be mistaken or fabricated. Source-region markers are seller-supplied
          and never automatically transferred to generated images.
        </p>
        <p>
          File digests check agreement between saved bytes and a supplied
          manifest. Someone replacing both can recompute them. They do not
          establish seller identity, a trusted timestamp or a shipped garment’s
          condition. Review summaries and question drafts are deterministic
          helpers based on your choices, not AI judgments or legal evidence
          certification.
        </p>
      </section>
      <section>
        <h2>Downloads, clearing and recovery</h2>
        <p>
          A private decision package may include your likeness and private
          notes. Store and share it carefully. Clearing local data removes
          app-local records and task-recovery tokens, not downloads, backups,
          host logs or provider-held data. Leaving during an upload cannot
          guarantee cancellation.
        </p>
        <p>
          Known tasks can be checked without another generation. An uncertain
          submission is not automatically recreated. Local storage can fail or
          be cleared by your browser; export important records.
        </p>
      </section>
      <section>
        <h2>What the example demonstrates</h2>
        <p>
          The public example uses a fictional garment, synthetic shopper and
          controlled synthetic condition images. Its recorded preview is an
          actual YouCam result. It does not demonstrate automatic defect
          detection or prove that the provider erased a defect. Initial
          feasibility used two synthetic shopper framings and one shirt; this is
          not a real-user accuracy or usefulness study.
        </p>
        <p>
          This is a free, limited-credit hackathon prototype for upper-body
          shirts and tops. No real-user impact study, broad garment validation,
          security certification or production-scale load test is claimed.
          Disclosure version: asshown-2026-10-20.
        </p>
      </section>
    </article>
  );
}
