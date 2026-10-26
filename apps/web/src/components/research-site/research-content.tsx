import Link from "next/link";
import type { CSSProperties } from "react";
import { InferenceChart } from "./inference-chart";
import { PilotRequest } from "./pilot-request";
import { EvidenceDots, ReleaseCurve } from "./research-figures";
import { SyntheticWorlds } from "./training-visuals";
export function ResearchContent() {
  return (
    <main id="main">
      <section className="page-hero" style={{ paddingBlock: "48px 64px" }}>
        <div className="wrap">
          <p className="crumbs">
            <Link href="/">{"Knoww"}</Link>
            {" / Research"}
          </p>
          <h1 className="mega">
            {"Learning to learn, "}
            <span className="mark">{"on tables."}</span>
          </h1>
          <p className="lede">
            <strong>
              {
                "Our bet: pre-train across synthetic and real longitudinal systems, then infer on unseen ones without retraining."
              }
            </strong>
            {
              " Here is how it works, what we have shown so far, and why the timing is right."
            }
          </p>
          <nav className="jump" aria-label="On this page">
            <a href="#how">
              {"How it works "}
              <span aria-hidden="true">{"↓"}</span>
            </a>
            <a href="#experiment">
              {"Experiment one "}
              <span aria-hidden="true">{"↓"}</span>
            </a>
            <a href="#stages">
              {"Three stages "}
              <span aria-hidden="true">{"↓"}</span>
            </a>
            <a href="#now">
              {"Why now "}
              <span aria-hidden="true">{"↓"}</span>
            </a>
            <a href="#reading">
              {"Reading list "}
              <span aria-hidden="true">{"↓"}</span>
            </a>
          </nav>
        </div>
      </section>
      <section id="how" className="panel">
        <div className="wrap">
          <div className="sec-head">
            <span className="label c">{"How it works"}</span>
            <h2>{"Train once on millions of worlds. Infer on yours."}</h2>
            <p>
              {
                "Prior-data fitted networks learn how structured data behaves from synthetic datasets. Shown new data, they find the pattern in a single forward pass."
              }
            </p>
          </div>
          <div className="how">
            <div className="how-step">
              <h3>
                <span className="label">{"01"}</span>
                {"Train · once"}
              </h3>
              <div className="how-frame">
                <div>
                  <span
                    className="label"
                    style={{ display: "block", marginBottom: "8px" }}
                  >
                    {"Synthetic datasets · × millions"}
                  </span>
                  <SyntheticWorlds research />
                </div>
                <div className="arrow" aria-hidden="true">
                  {"→"}
                </div>
                <div className="xformer">
                  <i></i>
                  <i></i>
                  <i></i>
                  <i></i>
                  <i></i>
                  <i></i>
                  <b>{"TRANSFORMER"}</b>
                </div>
              </div>
              <p>
                {"A transformer learns from "}
                <strong>{"millions of synthetic records"}</strong>
                {": what trends, seasonality, noise and shocks look like."}
              </p>
            </div>
            <div className="how-step">
              <h3>
                <span className="label">{"02"}</span>
                {"Infer · one forward pass"}
              </h3>
              <InferenceChart />
              <p>
                {"Show it new data. It "}
                <strong>{"finds the curve"}</strong>
                {
                  " and says how sure it is, with no retraining. This demo uses a Gaussian process to illustrate the behaviour."
                }
              </p>
            </div>
          </div>
          <div className="how-foot">
            <h3>
              {"Learn once. "}
              <em>{"Predict instantly."}</em>
            </h3>
            <span className="label">
              {"Prior-data fitted networks · Müller et al., 2022"}
            </span>
          </div>
        </div>
      </section>
      <section id="proof">
        <div className="wrap">
          <div className="proof-grid">
            <div>
              <span className="label">{"Proven on tables"}</span>
              <p className="statement" style={{ marginTop: "16px" }}>
                <span className="dim">
                  {"A PFN, out of the box, beat four hours of expert tuning"}
                </span>
                {" in 2.8 seconds."}
              </p>
              <p className="cite" style={{ marginTop: "16px" }}>
                {"Hollmann et al., Nature 637 (2025)"}
              </p>
            </div>
            <div
              className="vs tnum"
              aria-label="2.8 seconds versus 4 hours"
              role="img"
            >
              <div>
                <b>{"2.8s"}</b>
                <span>{"PFN, out of the box"}</span>
              </div>
              <div className="vs-x" aria-hidden="true">
                {"vs"}
              </div>
              <div>
                <b className="o">{"4h"}</b>
                <span>{"Experts tuning models"}</span>
              </div>
            </div>
          </div>
          <div className="extends">
            <span className="label">
              {"LTFM extends this to time and relations"}
            </span>
            <div className="ext-row">
              <div>
                <b>{"Time-series"}</b>
                <span>{"TimesFM, Chronos-2"}</span>
              </div>
              <i aria-hidden="true">{"+"}</i>
              <div>
                <b>{"Tabular"}</b>
                <span>{"TabPFN → SAP"}</span>
              </div>
              <i aria-hidden="true">{"+"}</i>
              <div>
                <b>{"Relational"}</b>
                <span>{"KumoRFM → NVIDIA"}</span>
              </div>
              <i aria-hidden="true">{"="}</i>
              <div className="res">
                <b>{"LTFM"}</b>
                <span>{"entities + state + history + transitions"}</span>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section id="experiment" className="rule-top">
        <div className="wrap">
          <div className="sec-head">
            <span className="label">{"Experiment one · Stage 0"}</span>
            <h2>
              {
                "Can structured history produce calibrated macro forecasts? Yes."
              }
            </h2>
            <p>
              {
                "We predicted imported macro events over one month. Each call was dated in advance and scored when it resolved."
              }
            </p>
          </div>
          <div className="exp">
            <div className="exp-left">
              <div
                className="flow"
                aria-label="Pipeline: scenarios, knowledge graph, calls"
                role="img"
              >
                <span className="box">{"10,580 scenarios"}</span>
                <span className="ar" aria-hidden="true">
                  {"→"}
                </span>
                <span className="box">{"knowledge graph"}</span>
                <span className="ar" aria-hidden="true">
                  {"→"}
                </span>
                <span className="box solid">{"22 dated calls"}</span>
              </div>
              <EvidenceDots />
              <p className="muted" style={{ fontSize: "15px" }}>
                {"↑ 22 dated calls, scored at resolution. Filled = right."}
              </p>
            </div>
            <div className="exp-right">
              <div className="stats-row tnum">
                <div>
                  <b>{"17/22"}</b>
                  <span>{"on the right side · 77%"}</span>
                </div>
                <div>
                  <b>{"0.146"}</b>
                  <span>{"Brier score"}</span>
                </div>
              </div>
              <div
                className="brier"
                role="img"
                aria-label="Brier score scale from 0, perfect, to 0.25, always saying 50 percent. Experiment one scored 0.146."
              >
                <div className="b-track">
                  <div className="b-mark" style={{ left: "58.4%" }}>
                    <span>{"0.146 · experiment one"}</span>
                  </div>
                </div>
                <div className="b-ends">
                  <span>{"0 · perfect"}</span>
                  <span>{"0.25 · always saying 50%"}</span>
                </div>
              </div>
              <p
                className="muted"
                style={{ fontSize: "16px", lineHeight: "24px" }}
              >
                {
                  "The Brier score is the mean squared gap between the stated probability and what happened. Lower is better. A forecaster who always says 50% scores 0.25."
                }
              </p>
            </div>
          </div>
        </div>
      </section>
      <section id="stages" className="rule-top">
        <div className="wrap">
          <div className="sec-head">
            <span className="label">
              {"Building the foundation model · internal stages"}
            </span>
            <h2>{"Three stages to a new foundation model."}</h2>
            <p>
              {
                "One model, built from the inside out. Each stage ships something real before the next begins."
              }
            </p>
          </div>
          <div className="stages">
            <div className="stage">
              <span className="label">{"Stage 0"}</span>
              <span className="badge ready">{"Solved"}</span>
              <h3>{"Macro prediction"}</h3>
              <p>
                {
                  "Calibrated calls on macro events from structured history. See experiment one."
                }
              </p>
            </div>
            <div className="ltfm-box">
              <div className="bar">
                <b>{"LTFM"}</b>
                <em>{"one model, built from the inside out"}</em>
              </div>
              <div className="ltfm-inner">
                <div className="stage hatch">
                  <span className="label">{"Stage 1 · LTFM core"}</span>
                  <span className="badge active">{"Building now"}</span>
                  <h3>{"LSM + Intelligence"}</h3>
                  <p>
                    {
                      "The internal state of LTFM, shipped first to financial-services ML teams."
                    }
                  </p>
                  <div
                    className="research-state-transition"
                    aria-label="state t to state t plus 1"
                    role="img"
                  >
                    <span>{"state t"}</span>
                    <span aria-hidden="true" className="ar">
                      {"→"}
                    </span>
                    <span className="n">{"state t+1"}</span>
                  </div>
                </div>
                <div className="arrow" aria-hidden="true">
                  {"→"}
                </div>
                <div className="stage goal">
                  <span className="label">
                    {"Stage 2 · Full LTFM · the goal"}
                  </span>
                  <h3 className="mega">{"LTFM"}</h3>
                  <p>{"The same core, generalised to every industry."}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section id="now" className="rule-top">
        <div className="wrap">
          <div className="sec-head">
            <span className="label">{"Why now"}</span>
            <h2>
              {
                "Tabular models are three years behind the LLM curve, and accelerating faster."
              }
            </h2>
            <p>
              {
                "Model releases over time. The tabular timeline is shifted three years to sit on the same axis."
              }
            </p>
          </div>
          <div className="now-grid">
            <figure className="chart" style={{ margin: "0" }}>
              <section
                className="chart-scroll"
                // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll the wide release chart.
                tabIndex={0}
                aria-label="Release curve chart"
              >
                <ReleaseCurve />
              </section>
              <figcaption className="cite" style={{ marginTop: "8px" }}>
                {
                  "Solid: LLMs 2021–24 (bold dates). Dashed: tabular foundation models 2024–26 (lighter dates). Each dot is a model release. Shaded: where tabular models are now."
                }
              </figcaption>
            </figure>
            <div className="now-side">
              <p className="q">
                {"Tabular foundation models: same curve, three years later."}
              </p>
              <div className="card">
                <span className="label">
                  {"The market is moving · ex: Revolut"}
                </span>
                <h3
                  style={{
                    fontSize: "36px",
                    lineHeight: "38px",
                    letterSpacing: ".04em",
                  }}
                >
                  {"PRAGMA FM"}
                </h3>
                <p>
                  {
                    "A BERT-style foundation model on longitudinal banking transactions."
                  }
                </p>
                <div className="chips">
                  <span className="chip">{"Fraud"}</span>
                  <span className="chip">{"Credit risk"}</span>
                  <span className="chip">{"Lifetime value"}</span>
                  <span className="chip">{"Underwriting"}</span>
                </div>
              </div>
              <div className="card dark">
                <span className="label c">{"We're next on the curve"}</span>
                <h3>{"LTFM: longitudinal, calibrated, opinionated."}</h3>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section id="loop" className="panel">
        <div className="wrap">
          <div className="sec-head">
            <span className="label c">{"Training → inference"}</span>
            <h2>{"Every version makes the next one smarter."}</h2>
            <p>
              {
                "Deployments show which patterns matter in real tasks. Those become better priors for the next round of pre-training."
              }
            </p>
          </div>
          <div className="loop">
            <div className="n" data-a="→">
              {"synthetic worlds"}
            </div>
            <div className="n" data-a="→">
              {"pretraining"}
            </div>
            <div className="n" data-a="→">
              {"public longitudinal data"}
            </div>
            <div className="n" data-a="↓">
              {"general representations"}
            </div>
            <div
              className="n end r2"
              data-a="↑"
              style={{ "--mo": 8 } as CSSProperties}
            >
              {"better LTFM"}
            </div>
            <div
              className="n r2"
              data-a="←"
              style={{ "--mo": 7 } as CSSProperties}
            >
              {"better priors"}
            </div>
            <div
              className="n r2"
              data-a="←"
              style={{ "--mo": 6 } as CSSProperties}
            >
              {"real-world task patterns"}
            </div>
            <div
              className="n r2"
              data-a="←"
              style={{ "--mo": 5 } as CSSProperties}
            >
              {"customer deployments"}
            </div>
          </div>
          <div className="loop-cap">
            <span>{"↑ repeat"}</span>
            <span>{"↓ deploy"}</span>
          </div>
        </div>
      </section>
      <section id="reading">
        <div className="wrap reading">
          <div>
            <span className="label">{"Reading list"}</span>
            <p className="r-num tnum">{"25"}</p>
            <p className="r-t">
              {"papers, "}
              <strong>{"read & connected"}</strong>
              {" before we wrote a line of LTFM."}
            </p>
          </div>
          <div>
            <ul className="papers">
              <li>
                <b>{"PFN"}</b>
                <span>
                  {"Prior-data fitted networks · Müller et al., 2022"}
                </span>
              </li>
              <li>
                <b>{"TabPFN"}</b>
                <span>
                  {"Tabular foundation model · Hollmann et al., Nature 2025"}
                </span>
              </li>
              <li>
                <b>{"TimesFM · Chronos-2"}</b>
                <span>{"Time-series foundation models"}</span>
              </li>
              <li>
                <b>{"KumoRFM"}</b>
                <span>{"Relational foundation model"}</span>
              </li>
            </ul>
            <div className="chips" style={{ marginTop: "16px" }}>
              <span className="chip">{"CausalFM"}</span>
              <span className="chip">{"ForecastFM"}</span>
              <span className="chip">{"TimeFN"}</span>
              <span className="chip">{"BayesNN"}</span>
              <span className="chip">{"LimiX"}</span>
              <span className="chip">{"PRAGMA"}</span>
            </div>
            <p
              className="muted"
              style={{ marginTop: "16px", fontSize: "15px" }}
            >
              {
                "…and more. We open research intake every 8 weeks. Researchers working on tabular or longitudinal models: write to "
              }
              <span className="tnum">{"contact@knoww.app"}</span>
              {"."}
            </p>
          </div>
        </div>
      </section>
      <PilotRequest />
      <section className="rule-top" style={{ paddingBlock: "48px 96px" }}>
        <div className="wrap">
          <nav className="nextband" aria-label="More about Knoww">
            <Link href="/">
              <span className="label">{"LTFM"}</span>
              <b>
                {"See it predict "}
                <span aria-hidden="true">{"→"}</span>
              </b>
              <p>{"One model, five tables, no retraining."}</p>
            </Link>
            <Link href="/use-cases">
              <span className="label">{"Use cases"}</span>
              <b>
                {"By industry "}
                <span aria-hidden="true">{"→"}</span>
              </b>
              <p>
                {"What LTFM predicts in each field, and how it's validated."}
              </p>
            </Link>
            <Link href="/company">
              <span className="label">{"Company"}</span>
              <b>
                {"Team & plan "}
                <span aria-hidden="true">{"→"}</span>
              </b>
              <p>{"Who we are and the 24-month roadmap."}</p>
            </Link>
          </nav>
        </div>
      </section>
    </main>
  );
}
