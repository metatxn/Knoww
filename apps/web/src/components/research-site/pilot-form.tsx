"use client";

import { type FormEvent, type RefObject, useState } from "react";
import {
  PILOT_ANSWER_TYPES,
  PILOT_BASELINES,
  PILOT_FIELD_IDS,
  PILOT_INDUSTRIES,
  PILOT_LIMITS,
  type PilotDraft,
  type PilotErrors,
  type PilotField,
  preparePilotRequest,
} from "./pilot-request-model";
import { ThemedSelect } from "./themed-select";

export function PilotForm({
  hidden,
  onPrepared,
  orgRef,
}: {
  hidden: boolean;
  onPrepared: (draft: PilotDraft) => void;
  orgRef: RefObject<HTMLInputElement | null>;
}) {
  const [errors, setErrors] = useState<PilotErrors>({});
  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const result = preparePilotRequest(Object.fromEntries(new FormData(form)));
    if (!result.success) {
      setErrors(result.errors);
      const first = (Object.keys(PILOT_FIELD_IDS) as PilotField[]).find(
        (field) => result.errors[field]
      );
      if (first)
        form.querySelector<HTMLElement>(`#${PILOT_FIELD_IDS[first]}`)?.focus();
      return;
    }
    setErrors({});
    onPrepared(result.draft);
  }
  return (
    <form
      className="form grid gap-6"
      hidden={hidden}
      onSubmit={prepare}
      noValidate
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="field grid gap-2">
          <label htmlFor="pf-org">Organisation</label>
          <input
            ref={orgRef}
            className="input"
            id="pf-org"
            name="org"
            autoComplete="organization"
            required
            maxLength={PILOT_LIMITS.org}
            aria-invalid={Boolean(errors.org) || undefined}
            aria-describedby="pf-org-h"
          />
          <span className={errors.org ? "help err" : "help"} id="pf-org-h">
            {errors.org ?? "The company or team running the pilot."}
          </span>
        </div>
        <div className="field grid gap-2">
          <label id="pf-industry-label" htmlFor="pf-industry">
            Industry
          </label>
          <ThemedSelect
            id="pf-industry"
            name="industry"
            options={PILOT_INDUSTRIES}
            invalid={Boolean(errors.industry)}
            describedBy={errors.industry ? "pf-industry-h" : undefined}
          />
          {errors.industry && (
            <span className="help err" id="pf-industry-h">
              {errors.industry}
            </span>
          )}
        </div>
      </div>
      <div className="field grid gap-2">
        <label htmlFor="pf-question">The question</label>
        <input
          className="input"
          id="pf-question"
          name="question"
          required
          maxLength={PILOT_LIMITS.question}
          aria-invalid={Boolean(errors.question) || undefined}
          aria-describedby="pf-question-h"
          placeholder="e.g. Will this shipment arrive late?"
        />
        <span
          className={errors.question ? "help err" : "help"}
          id="pf-question-h"
        >
          {errors.question ?? "One question you'd like answered ahead of time."}
        </span>
      </div>
      <fieldset
        className="field grid gap-2"
        aria-describedby={errors.kind ? "pf-kind-h" : undefined}
      >
        <legend>What kind of answer?</legend>
        <div className="checks">
          <label className="check">
            <input
              id="pf-kind"
              type="radio"
              name="kind"
              value={PILOT_ANSWER_TYPES[0]}
              defaultChecked
            />{" "}
            Yes / no, with a probability
          </label>
          <label className="check">
            <input type="radio" name="kind" value={PILOT_ANSWER_TYPES[1]} /> A
            number, like a forecast
          </label>
        </div>
        {errors.kind && (
          <span className="help err" id="pf-kind-h">
            {errors.kind}
          </span>
        )}
      </fieldset>
      <div className="field grid gap-2">
        <label id="pf-baseline-label" htmlFor="pf-baseline">
          Current model
        </label>
        <ThemedSelect
          id="pf-baseline"
          name="baseline"
          describedBy="pf-baseline-help"
          options={PILOT_BASELINES}
          invalid={Boolean(errors.baseline)}
        />
        <span
          className={errors.baseline ? "help err" : "help"}
          id="pf-baseline-help"
        >
          {errors.baseline ??
            "LTFM runs side by side with it, so this sets the benchmark."}
        </span>
      </div>
      <div className="field grid gap-2">
        <label htmlFor="pf-notes">Anything else</label>
        <textarea
          className="input"
          id="pf-notes"
          name="notes"
          maxLength={PILOT_LIMITS.notes}
          aria-invalid={Boolean(errors.notes) || undefined}
          aria-describedby={errors.notes ? "pf-notes-h" : undefined}
          placeholder="The data you keep, how far back it goes, timelines."
        />
        {errors.notes && (
          <span className="help err" id="pf-notes-h">
            {errors.notes}
          </span>
        )}
      </div>
      <div>
        <button className="btn btn-primary" type="submit">
          Prepare pilot request
        </button>
      </div>
      <p className="help">
        This prepares an email request. Nothing is sent automatically.
      </p>
      <p className="help err" role="alert">
        {Object.keys(errors).length > 0
          ? "Complete the highlighted fields."
          : ""}
      </p>
    </form>
  );
}
