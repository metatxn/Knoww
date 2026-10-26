"use client";

import { useRef, useState } from "react";
import { CopyButton } from "./copy-button";
import { PilotForm } from "./pilot-form";
import { PILOT_EMAIL, type PilotDraft } from "./pilot-request-model";

export function PilotRequest() {
  const [draft, setDraft] = useState<PilotDraft | null>(null);
  const orgRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);

  return (
    <section id="pilot" className="rule-top">
      <div className="wrap pilot-req">
        <div className="intro">
          <span className="label">Request a pilot</span>
          <h2 className="mega">What do you want to predict?</h2>
          <p>
            Every pilot starts in shadow mode. LTFM predicts on your cases next
            to what you use today and changes no decisions. Tell us what you
            want to predict and we'll reply with a pilot plan.
          </p>
          <div className="copyrow">
            <a href={`mailto:${PILOT_EMAIL}`}>
              <code>{PILOT_EMAIL}</code>
            </a>
            <CopyButton text={PILOT_EMAIL} />
          </div>
        </div>
        <div className="formbox">
          <PilotForm
            hidden={Boolean(draft)}
            orgRef={orgRef}
            onPrepared={(prepared) => {
              setDraft(prepared);
              requestAnimationFrame(() => resultRef.current?.focus());
            }}
          />
          {draft && (
            <div className="result">
              <h3 className="label" ref={resultRef} tabIndex={-1}>
                Your pilot request
              </h3>
              <pre>{draft.body}</pre>
              <div className="flex flex-wrap gap-3">
                <a className="btn btn-primary" href={draft.mailto}>
                  Open email draft
                </a>
                <CopyButton
                  text={`Subject: ${draft.subject}\n\n${draft.body}`}
                  label="Copy request"
                />
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => {
                    setDraft(null);
                    requestAnimationFrame(() => orgRef.current?.focus());
                  }}
                >
                  Edit
                </button>
              </div>
              <p className="status">
                Send your request to {PILOT_EMAIL} using your email app.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
