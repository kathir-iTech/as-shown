"use client";
import { useState } from "react";
import {
  ArrowUpRight,
  Check,
  Copy,
  Download,
  MessageSquareText,
} from "lucide-react";
import { type Bundle } from "@/domain/model";
import { decisionBrief } from "@/domain/decision";
import { download } from "@/domain/browser";

export function DecisionDesk({ bundle }: { bundle: Bundle }) {
  const [copiedMessage, setCopiedMessage] = useState("");
  const [copyError, setCopyError] = useState("");
  const [showMessage, setShowMessage] = useState(false);
  const brief = decisionBrief(bundle);
  return (
    <section className="decision-desk" aria-label="Your decision brief">
      <div className="desk-heading">
        <span className="eyebrow">Your decision brief</span>
        <span className="pill outline">Private · on this device</span>
      </div>
      <div className="desk-body">
        <div>
          <h2>{brief.title}</h2>
          <p>
            This summary follows your choices. It does not assess the garment or
            recommend a purchase.
          </p>
        </div>
        <dl className="decision-counts">
          <div>
            <dt>Reviewed</dt>
            <dd>
              {brief.reviewed}
              <span>/{brief.total}</span>
            </dd>
          </div>
          <div>
            <dt>Ask seller</dt>
            <dd>{brief.questions.length}</dd>
          </div>
          <div>
            <dt>Reasons to pass</dt>
            <dd>{brief.skipped.length}</dd>
          </div>
        </dl>
      </div>
      <div className="coverage-strip">
        {(["front", "back", "reference"] as const)
          .filter((role) => bundle.item.assets.some((a) => a.role === role))
          .map((role) => (
            <span key={role}>
              <Check size={14} />
              {role[0].toUpperCase() + role.slice(1)} photo
            </span>
          ))}
        <span>
          <Check size={14} />
          Revision {bundle.item.revision}
        </span>
        <span>Presence checked · claims unverified</span>
      </div>
      <button
        className="text-button"
        onClick={() => setShowMessage(!showMessage)}
        aria-expanded={showMessage}
        aria-controls="seller-question-draft"
      >
        <MessageSquareText size={17} />
        {showMessage
          ? "Close seller question draft"
          : "Prepare questions for the seller"}
        <ArrowUpRight size={16} />
      </button>
      {showMessage && (
        <div id="seller-question-draft" className="seller-message">
          <label>
            Seller question draft
            <textarea value={brief.message} readOnly rows={8} />
          </label>
          <p className="small">
            Built from “Ask seller” choices and your notes. Review before
            sharing; nothing is sent automatically.
          </p>
          <div className="message-actions">
            <button
              className="button secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(brief.message);
                  setCopiedMessage(brief.message);
                  setCopyError("");
                } catch {
                  setCopyError(
                    "Clipboard access was unavailable. Select the text above or download it.",
                  );
                }
              }}
            >
              <Copy size={16} />
              {copiedMessage === brief.message
                ? "Copied to clipboard"
                : "Copy question draft"}
            </button>
            <button
              className="text-button"
              onClick={() =>
                download(
                  new TextEncoder().encode(brief.message),
                  `as-shown-questions-r${bundle.item.revision}.txt`,
                  "text/plain;charset=utf-8",
                )
              }
            >
              <Download size={16} />
              Download text
            </button>
          </div>
          {copyError && <p role="status">{copyError}</p>}
        </div>
      )}
    </section>
  );
}
