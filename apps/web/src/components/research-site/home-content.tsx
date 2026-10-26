import Link from "next/link";
import { EntityLedger, ModelGrid } from "./home-figures";
import { InferenceChart } from "./inference-chart";
import { ModelConsole } from "./model-console";
import { PilotRequest } from "./pilot-request";
import { DataStreams, SyntheticWorlds } from "./training-visuals";
export function LtfmHome() {
  return (
    <main id="main">
      <section className="hx" id="hero" aria-labelledby="hx-title">
        <DataStreams />
        <div className="hx-aurora" aria-hidden="true">
          <i></i>
          <i></i>
          <i></i>
        </div>
        <div className="wrap">
          <div className="hx-head">
            <div>
              <h1 className="hx-h" id="hx-title">
                {"Train once on millions of worlds. "}
                <span className="hx-accent">{"Infer on yours."}</span>
              </h1>
            </div>
            <div className="hx-side">
              <p className="hx-lede">
                {
                  "Prior-data fitted networks learn how structured data behaves from synthetic datasets. Shown new data, they find the pattern in a single forward pass."
                }
              </p>
              <div className="hx-cta">
                <a className="btn btn-primary" href="#pilot">
                  {"Request a pilot"}
                </a>
                <a className="btn btn-secondary" href="#console">
                  {"See it predict"}
                </a>
              </div>
            </div>
          </div>
          <div className="hx-grid">
            <div className="hx-train">
              <div className="hx-step">
                <span className="hx-n">{"01"}</span>
                <b>{"Train · once"}</b>
              </div>
              <span className="label">{"synthetic datasets × millions"}</span>
              <div className="hx-pipe">
                <SyntheticWorlds />
                <div className="hx-flow" aria-hidden="true">
                  <i></i>
                  <i></i>
                  <i></i>
                </div>
                <div
                  className="hx-xf"
                  id="hxXf"
                  role="img"
                  aria-label="Transformer"
                >
                  <i></i>
                  <i></i>
                  <i></i>
                  <i></i>
                  <i></i>
                  <i></i>
                  <b>{"transformer"}</b>
                </div>
              </div>
              <p className="hx-cap">
                {"A transformer learns from "}
                <strong>{"millions of synthetic records"}</strong>
                {": what trends, seasonality, noise and shocks look like."}
              </p>
            </div>
            <div className="hx-join" aria-hidden="true">
              <i></i>
              <span>{"one forward pass"}</span>
            </div>
            <InferenceChart hero />
          </div>
        </div>
      </section>

      <section
        id="console"
        className="console-sec"
        aria-labelledby="console-title"
      >
        <div className="wrap">
          <ModelConsole />
          <p className="c-note">
            {
              "Switch the table: same model, a different question, no retraining. Select a row to see why it scored the way it did. All rows and scores here are synthetic examples that show how LTFM reports results; they are not model output."
            }
          </p>
        </div>
      </section>

      <section id="shift" className="rule-top">
        <div className="wrap">
          <div className="sec-head">
            <span className="label">{"The problem"}</span>
            <h2>
              {
                "Every business is trying to see tomorrow. Tree-based models make it slow."
              }
            </h2>
            <p>
              {
                "One question means one model, built by hand. When the world shifts, every one of them is rebuilt and revalidated."
              }
            </p>
          </div>
          <div className="shift">
            <div className="shift-viz">
              <ModelGrid />
              <div className="shift-key">
                <span>
                  <i className="sw">{"M"}</i>
                  {"One new question, one new model"}
                </span>
                <span>
                  <i className="sw re">{"↻"}</i>
                  {"Rebuilt when the world changes"}
                </span>
              </div>
            </div>
            <table className="compare" aria-label="Today compared with LTFM">
              <tbody>
                <tr className="cmp-h">
                  <th scope="col" className="label">
                    {"When…"}
                  </th>
                  <th scope="col" className="label">
                    {"Today"}
                  </th>
                  <th scope="col" className="label">
                    {"With LTFM"}
                  </th>
                </tr>
                <tr className="cmp-r">
                  <th scope="row">{"A new question comes up"}</th>
                  <td>{"A new model and weeks of feature work"}</td>
                  <td>{"A new input to the same model"}</td>
                </tr>
                <tr className="cmp-r">
                  <th scope="row">{"The world shifts"}</th>
                  <td>{"Rebuild, retune, revalidate"}</td>
                  <td>{"Adapts without retraining"}</td>
                </tr>
                <tr className="cmp-r">
                  <th scope="row">{"Data is thin"}</th>
                  <td>{"The model can't learn much"}</td>
                  <td>{"Priors from pre-training fill the gap"}</td>
                </tr>
                <tr className="cmp-r">
                  <th scope="row">{"It reports a score"}</th>
                  <td>{"A single number"}</td>
                  <td>{"A calibrated probability with a band"}</td>
                </tr>
                <tr className="cmp-r">
                  <th scope="row">{"It isn't sure"}</th>
                  <td>{"It scores anyway"}</td>
                  <td>{"It abstains and your model takes over"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="reads" className="panel">
        <div className="wrap">
          <div className="sec-head">
            <span className="label c">{"What LTFM reads"}</span>
            <h2>
              {"Entities, their state, their history and every transition."}
            </h2>
            <p>
              {
                "AI reads language, images and code. No LLM understands tables. LTFM is built for the rows and columns every business runs on: spreadsheets, databases, ledgers, logs."
              }
            </p>
          </div>
          <section
            className="ledger-wrap"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll the wide example table.
            tabIndex={0}
            aria-label="Example of a longitudinal table"
          >
            <EntityLedger />
          </section>
          <div className="ledger-key">
            <span className="label" style={{ color: "inherit" }}>
              {"Example · a supply-to-customer chain"}
            </span>
            <span>
              <i className="st s0"></i>
              {"Normal"}
            </span>
            <span>
              <i className="st s1"></i>
              {"Watch"}
            </span>
            <span>
              <i className="st s2"></i>
              {"Stressed"}
            </span>
            <span>
              <i className="st s3"></i>
              {"Flagged"}
            </span>
            <span>{"▸ Transition"}</span>
            <span>{"└ Relation"}</span>
          </div>
          <div className="equation">
            <div className="eq-box">
              <h3>{"Time-series"}</h3>
              <p>{"TimesFM, Chronos-2"}</p>
            </div>
            <div className="eq-op" aria-hidden="true">
              {"+"}
            </div>
            <div className="eq-box">
              <h3>{"Tabular"}</h3>
              <p>{"TabPFN → acquired by SAP"}</p>
            </div>
            <div className="eq-op" aria-hidden="true">
              {"+"}
            </div>
            <div className="eq-box">
              <h3>{"Relational"}</h3>
              <p>{"KumoRFM → NVIDIA"}</p>
            </div>
            <div className="eq-op" aria-hidden="true">
              {"="}
            </div>
            <div className="eq-result">
              <b>{"LTFM"}</b>
              <p>{"entities + state + history + transitions"}</p>
            </div>
          </div>
          <p className="statement" style={{ marginTop: "64px" }}>
            <span className="dim">{"Existing models see a piece."}</span>
            {" LTFM sees the whole."}
          </p>
        </div>
      </section>

      <section id="why">
        <div className="wrap">
          <div className="sec-head">
            <span className="label">{"Why LTFM"}</span>
            <h2>{"Four things today's predictive models don't do at once."}</h2>
            <p>
              {
                "Learning-to-learn is already proven on tables. LTFM extends it to data that changes over time, in any domain."
              }
            </p>
          </div>
          <div className="grid-4 promises">
            <article className="card">
              <span className="label">{"01 · Data"}</span>
              <h3>{"Learns from little data"}</h3>
              <p>
                {
                  "Priors learned across millions of synthetic datasets carry it where your history is short: a new product, a new market, a new supplier."
                }
              </p>
            </article>
            <article className="card">
              <span className="label">{"02 · Time"}</span>
              <h3>{"Understands change"}</h3>
              <p>
                {
                  "Reads each entity's history and the transitions between its states, not a snapshot."
                }
              </p>
            </article>
            <article className="card">
              <span className="label">{"03 · Calibration"}</span>
              <h3>{"Says how sure it is"}</h3>
              <p>
                {
                  "Every score comes with a band. Less data means a wider band, and you can see it."
                }
              </p>
            </article>
            <article className="card dark">
              <span className="label">{"04 · Adaptation"}</span>
              <h3>{"Adapts, no retraining"}</h3>
              <p>
                {
                  "A new question is a new input. The model you validated is the model that answers."
                }
              </p>
            </article>
          </div>
          <div
            className="race"
            role="img"
            aria-label="A prior-data fitted network out of the box took 2.8 seconds and beat 4 hours of expert model tuning."
          >
            <div className="race-h">
              <span className="label">{"Proof it works on tables"}</span>
              <span className="cite">
                {"Hollmann et al., Nature 637 (2025)"}
              </span>
            </div>
            <div className="race-row">
              <span>{"PFN, out of the box"}</span>
              <div className="race-track">
                <div className="race-fill c" style={{ width: "0.6%" }}></div>
              </div>
              <b>{"2.8s"}</b>
            </div>
            <div className="race-row">
              <span>{"Experts tuning models"}</span>
              <div className="race-track">
                <div className="race-fill" style={{ width: "100%" }}></div>
              </div>
              <b>{"4h"}</b>
            </div>
            <p className="race-cap">
              {
                "A prior-data fitted network, out of the box, beat four hours of expert tuning. One forward pass is enough to replace tree-based models. "
              }
              <Link className="textlink" href="/research#how">
                {"How it works "}
                <span aria-hidden="true">{"→"}</span>
              </Link>
            </p>
          </div>
        </div>
      </section>

      <section id="risk" className="panel">
        <div className="wrap">
          <div className="sec-head">
            <span className="label c">{"Built to be trusted"}</span>
            <h2>{"Ready for high-stakes decisions."}</h2>
            <p>
              {
                "Predictions that move money, care or stock need evidence. LTFM is validated like any model you run today, and it takes no decision until you sign off. We start with banks, the strictest review there is."
              }
            </p>
          </div>
          <div className="grid-4 gov">
            <div className="gov-i">
              <svg className="icon" viewBox="0 0 40 40" aria-hidden="true">
                <rect
                  x="6"
                  y="22"
                  width="6"
                  height="12"
                  fill="currentColor"
                ></rect>
                <rect
                  x="16"
                  y="15"
                  width="6"
                  height="19"
                  fill="currentColor"
                ></rect>
                <rect
                  x="26"
                  y="7"
                  width="6"
                  height="27"
                  fill="currentColor"
                ></rect>
                <rect
                  x="3"
                  y="35"
                  width="34"
                  height="2"
                  fill="currentColor"
                ></rect>
              </svg>
              <h3>{"Validated like any model you run"}</h3>
              <p>{"Out-of-time backtests on your own history."}</p>
            </div>
            <div className="gov-i">
              <svg className="icon" viewBox="0 0 40 40" aria-hidden="true">
                <rect
                  x="5"
                  y="8"
                  width="4"
                  height="4"
                  fill="currentColor"
                ></rect>
                <rect
                  x="13"
                  y="9"
                  width="22"
                  height="2"
                  fill="currentColor"
                ></rect>
                <rect
                  x="5"
                  y="18"
                  width="4"
                  height="4"
                  fill="currentColor"
                ></rect>
                <rect
                  x="13"
                  y="19"
                  width="16"
                  height="2"
                  fill="currentColor"
                ></rect>
                <rect
                  x="5"
                  y="28"
                  width="4"
                  height="4"
                  fill="currentColor"
                ></rect>
                <rect
                  x="13"
                  y="29"
                  width="10"
                  height="2"
                  fill="currentColor"
                ></rect>
              </svg>
              <h3>{"Every score has reasons"}</h3>
              <p>{"Plain-language reasons for every prediction."}</p>
            </div>
            <div className="gov-i">
              <svg className="icon" viewBox="0 0 40 40" aria-hidden="true">
                <circle
                  cx="20"
                  cy="20"
                  r="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                ></circle>
                <rect
                  x="12"
                  y="19"
                  width="16"
                  height="2.5"
                  fill="currentColor"
                ></rect>
              </svg>
              <h3>{"Knows when not to answer"}</h3>
              <p>{"Abstains and falls back to your model."}</p>
            </div>
            <div className="gov-i">
              <svg className="icon" viewBox="0 0 40 40" aria-hidden="true">
                <path
                  d="M13 18v-5a7 7 0 0 1 14 0v5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                ></path>
                <rect
                  x="9"
                  y="18"
                  width="22"
                  height="17"
                  fill="currentColor"
                ></rect>
                <rect
                  x="18.5"
                  y="23"
                  width="3"
                  height="7"
                  fill="var(--panel)"
                ></rect>
              </svg>
              <h3>{"Your data stays with you"}</h3>
              <p>{"Private deploy, full audit trail."}</p>
            </div>
          </div>
          <div className="risk-steps">
            <span className="label">{"How every pilot runs"}</span>
            <ol className="steps">
              <li>
                <span className="label"></span>
                <b>{"Shadow mode"}</b>
                <p>
                  {
                    "LTFM scores live cases. Your current process keeps deciding."
                  }
                </p>
              </li>
              <li>
                <span className="label"></span>
                <b>{"Side by side"}</b>
                <p>{"Both compared on the same cases."}</p>
              </li>
              <li>
                <span className="label"></span>
                <b>{"Validation sign-off"}</b>
                <p>{"Your reviewers check backtests and reasons."}</p>
              </li>
              <li className="live">
                <span className="label"></span>
                <b>{"LIVE"}</b>
                <p>
                  {"In production, with your current process as the fallback."}
                </p>
              </li>
            </ol>
          </div>
          <Link className="btn btn-primary" href="/use-cases#trust">
            {"How validation works"}
          </Link>
        </div>
      </section>

      <section id="industries" className="rule-top">
        <div className="wrap">
          <div className="sec-head">
            <span className="label">{"Who it's for"}</span>
            <h2>{"Anyone with a table and a question about tomorrow."}</h2>
            <p>
              {
                "Every industry runs on rows and columns that change over time. The same model answers each one's question. We start with financial services."
              }
            </p>
          </div>
          <div className="ind-grid">
            <Link className="ind first" href="/use-cases#finance">
              <span className="label">{"Financial services · first"}</span>
              <b>{"Will this account default?"}</b>
              <span className="ind-more">
                {"Fraud · credit · underwriting · collections"}
              </span>
            </Link>
            <Link className="ind" href="/use-cases#insurance">
              <span className="label">{"Insurance"}</span>
              <b>{"Is this claim genuine?"}</b>
              <span className="ind-more">{"Claims · renewals · pricing"}</span>
            </Link>
            <Link className="ind" href="/use-cases#healthcare">
              <span className="label">{"Healthcare"}</span>
              <b>{"Will this patient return?"}</b>
              <span className="ind-more">
                {"Readmissions · no-shows · demand"}
              </span>
            </Link>
            <Link className="ind" href="/use-cases#supply">
              <span className="label">{"Supply chain"}</span>
              <b>{"Will this shipment be late?"}</b>
              <span className="ind-more">
                {"Delays · supplier risk · lead times"}
              </span>
            </Link>
            <Link className="ind" href="/use-cases#retail">
              <span className="label">{"Retail & inventory"}</span>
              <b>{"How much sells next week?"}</b>
              <span className="ind-more">{"Demand · churn · stock-outs"}</span>
            </Link>
            <Link className="ind" href="/use-cases#macro">
              <span className="label">{"Policy & macro"}</span>
              <b>{"Will rates be cut?"}</b>
              <span className="ind-more">{"Rates · inflation · events"}</span>
            </Link>
            <Link className="ind" href="/use-cases#geopolitics">
              <span className="label">{"Geopolitics"}</span>
              <b>{"Will this conflict escalate?"}</b>
              <span className="ind-more">
                {"Escalation · sanctions · trade"}
              </span>
            </Link>
            <a className="ind own" href="#pilot">
              <span className="label">{"Your table"}</span>
              <b>{"What do you need to predict?"}</b>
              <span className="ind-more">{"Tell us the question →"}</span>
            </a>
          </div>
        </div>
      </section>
      <PilotRequest />
      <section className="rule-top" style={{ paddingBlock: "48px 96px" }}>
        <div className="wrap">
          <nav className="nextband" aria-label="More about Knoww">
            <Link href="/use-cases">
              <span className="label">{"Use cases"}</span>
              <b>
                {"By industry "}
                <span aria-hidden="true">{"→"}</span>
              </b>
              <p>
                {
                  "What LTFM predicts in each field, how it's validated, and common questions."
                }
              </p>
            </Link>
            <Link href="/research">
              <span className="label">{"Research"}</span>
              <b>
                {"How it works "}
                <span aria-hidden="true">{"→"}</span>
              </b>
              <p>
                {
                  "Train once on synthetic worlds. Infer on yours. Experiment one in full."
                }
              </p>
            </Link>
            <Link href="/company">
              <span className="label">{"Company"}</span>
              <b>
                {"Team & plan "}
                <span aria-hidden="true">{"→"}</span>
              </b>
              <p>
                {"Who we are, how we found this, and the 24-month roadmap."}
              </p>
            </Link>
          </nav>
        </div>
      </section>
    </main>
  );
}
