import Link from "next/link";
import { PilotRequest } from "./pilot-request";
export function UseCasesContent() {
  return (
    <main id="main">
      <section className="page-hero" style={{ paddingBlock: "48px 64px" }}>
        <div className="wrap">
          <p className="crumbs">
            <Link href="/">{"Knoww"}</Link>
            {" / Use cases"}
          </p>
          <h1 className="mega">
            {"If it has history, "}
            <span className="mark">{"LTFM can predict it."}</span>
          </h1>
          <p className="lede">
            <strong>
              {
                "LTFM reads any table where things change over time: accounts, claims, patients, shipments, products, customers, countries."
              }
            </strong>
            {
              " One pre-trained model answers each field's question, with a calibrated probability, reasons, and no model to build. We start with financial services."
            }
          </p>
          <nav className="jump" aria-label="On this page">
            <a href="#industries">
              {"Industries "}
              <span aria-hidden="true">{"↓"}</span>
            </a>
            <a href="#fit">
              {"Is your problem a fit? "}
              <span aria-hidden="true">{"↓"}</span>
            </a>
            <a href="#trust">
              {"Validation & trust "}
              <span aria-hidden="true">{"↓"}</span>
            </a>
            <a href="#faq">
              {"Questions "}
              <span aria-hidden="true">{"↓"}</span>
            </a>
          </nav>
        </div>
      </section>
      <section id="industries">
        <div className="wrap">
          <div className="sec-head">
            <span className="label">{"Industries"}</span>
            <h2>{"One model. Every field's question about tomorrow."}</h2>
            <p>
              {
                "Today each of these questions is its own model, with its own features, tuning and upkeep. With LTFM it's the same model and a different table."
              }
            </p>
          </div>
          <div className="uc-list">
            <article className="uc" id="finance">
              <div className="uc-name">
                <h3 className="mega">{"Financial services"}</h3>
                <span className="badge active">{"Starting here"}</span>
              </div>
              <div className="uc-q">
                <span className="label">{"Questions"}</span>
                <ul>
                  <li>{"Will this account default within 90 days?"}</li>
                  <li>{"Is this transaction fraud?"}</li>
                  <li>{"Which accounts roll into collections?"}</li>
                </ul>
              </div>
              <div className="uc-in">
                <span className="label">{"LTFM reads"}</span>
                <div className="chips">
                  <span className="chip">{"Balances & utilisation"}</span>
                  <span className="chip">{"Payment history"}</span>
                  <span className="chip">{"Transactions"}</span>
                  <span className="chip">{"Linked accounts"}</span>
                </div>
              </div>
              <div className="uc-out">
                <span className="label">{"Why first"}</span>
                <p>
                  {
                    "The richest longitudinal records and the strictest model review. If LTFM passes here, it passes anywhere."
                  }
                </p>
              </div>
            </article>
            <article className="uc" id="insurance">
              <div className="uc-name">
                <h3 className="mega">{"Insurance"}</h3>
              </div>
              <div className="uc-q">
                <span className="label">{"Questions"}</span>
                <ul>
                  <li>{"Is this claim genuine?"}</li>
                  <li>{"Will this policyholder renew?"}</li>
                </ul>
              </div>
              <div className="uc-in">
                <span className="label">{"LTFM reads"}</span>
                <div className="chips">
                  <span className="chip">{"Claims history"}</span>
                  <span className="chip">{"Policy changes"}</span>
                  <span className="chip">{"Linked policies"}</span>
                </div>
              </div>
              <div className="uc-out">
                <span className="label">{"You get"}</span>
                <p>
                  {
                    "A probability per claim or policy, the reasons behind it, and an abstain flag for cases it hasn't seen."
                  }
                </p>
              </div>
            </article>
            <article className="uc" id="healthcare">
              <div className="uc-name">
                <h3 className="mega">{"Healthcare"}</h3>
              </div>
              <div className="uc-q">
                <span className="label">{"Questions"}</span>
                <ul>
                  <li>{"Will this patient return within 30 days?"}</li>
                  <li>{"Will this appointment be missed?"}</li>
                </ul>
              </div>
              <div className="uc-in">
                <span className="label">{"LTFM reads"}</span>
                <div className="chips">
                  <span className="chip">{"Visit history"}</span>
                  <span className="chip">{"Appointments"}</span>
                  <span className="chip">{"Care pathways"}</span>
                </div>
              </div>
              <div className="uc-out">
                <span className="label">{"You get"}</span>
                <p>
                  {
                    "Risk with a band that widens for patients with little history, so teams see how much is known."
                  }
                </p>
              </div>
            </article>
            <article className="uc" id="supply">
              <div className="uc-name">
                <h3 className="mega">{"Supply chain"}</h3>
              </div>
              <div className="uc-q">
                <span className="label">{"Questions"}</span>
                <ul>
                  <li>{"Will this shipment arrive late?"}</li>
                  <li>{"Which supplier is about to slip?"}</li>
                </ul>
              </div>
              <div className="uc-in">
                <span className="label">{"LTFM reads"}</span>
                <div className="chips">
                  <span className="chip">{"Lead times"}</span>
                  <span className="chip">{"Delivery history"}</span>
                  <span className="chip">
                    {"Supplier → lane → warehouse links"}
                  </span>
                </div>
              </div>
              <div className="uc-out">
                <span className="label">{"You get"}</span>
                <p>
                  {
                    "Late-arrival probabilities per shipment, still current when routes and suppliers change."
                  }
                </p>
              </div>
            </article>
            <article className="uc" id="retail">
              <div className="uc-name">
                <h3 className="mega">{"Retail & inventory"}</h3>
              </div>
              <div className="uc-q">
                <span className="label">{"Questions"}</span>
                <ul>
                  <li>{"How much sells next week?"}</li>
                  <li>{"Will this customer stop buying?"}</li>
                </ul>
              </div>
              <div className="uc-in">
                <span className="label">{"LTFM reads"}</span>
                <div className="chips">
                  <span className="chip">{"Sales history"}</span>
                  <span className="chip">{"Orders"}</span>
                  <span className="chip">{"Stock levels"}</span>
                </div>
              </div>
              <div className="uc-out">
                <span className="label">{"You get"}</span>
                <p>
                  {
                    "Forecasts and churn risk for new products and new stores too, where history is short."
                  }
                </p>
              </div>
            </article>
            <article className="uc" id="macro">
              <div className="uc-name">
                <h3 className="mega">{"Policy & macro"}</h3>
              </div>
              <div className="uc-q">
                <span className="label">{"Questions"}</span>
                <ul>
                  <li>{"Will rates be cut?"}</li>
                  <li>{"Will this macro event happen by its date?"}</li>
                </ul>
              </div>
              <div className="uc-in">
                <span className="label">{"LTFM reads"}</span>
                <div className="chips">
                  <span className="chip">{"Scenarios"}</span>
                  <span className="chip">{"Economic series"}</span>
                  <span className="chip">{"Event histories"}</span>
                </div>
              </div>
              <div className="uc-out">
                <span className="label">{"Already tested"}</span>
                <p>
                  {
                    "Experiment one: 17 of 22 dated macro calls right, Brier score 0.146. "
                  }
                  <Link
                    className="textlink"
                    href="/research#experiment"
                    style={{ minHeight: "0" }}
                  >
                    {"Read it →"}
                  </Link>
                </p>
              </div>
            </article>
            <article className="uc" id="geopolitics">
              <div className="uc-name">
                <h3 className="mega">{"Geopolitics"}</h3>
              </div>
              <div className="uc-q">
                <span className="label">{"Questions"}</span>
                <ul>
                  <li>{"Will this conflict escalate?"}</li>
                </ul>
              </div>
              <div className="uc-in">
                <span className="label">{"LTFM reads"}</span>
                <div className="chips">
                  <span className="chip">{"Event timelines"}</span>
                  <span className="chip">{"Country relationships"}</span>
                </div>
              </div>
              <div className="uc-out">
                <span className="label">{"You get"}</span>
                <p>
                  {
                    "Dated, calibrated probabilities you can score against what actually happens."
                  }
                </p>
              </div>
            </article>
          </div>
        </div>
      </section>
      <section id="fit" className="panel">
        <div className="wrap">
          <div className="sec-head">
            <span className="label c">{"Is your problem a fit?"}</span>
            <h2>{"Three questions to check."}</h2>
            <p>
              {
                "If you answer yes to all three, LTFM can likely help, whatever your industry."
              }
            </p>
          </div>
          <ol className="fit">
            <li>
              <b>{"Do you keep records over time?"}</b>
              <p>
                {
                  "Rows for things (customers, assets, orders, patients) with a history of what happened to them."
                }
              </p>
            </li>
            <li>
              <b>
                {
                  "Is there a yes/no or a number you want to know ahead of time?"
                }
              </b>
              <p>
                {
                  "Will it default, churn, arrive late, return, escalate? How much will sell?"
                }
              </p>
            </li>
            <li>
              <b>{"Does the answer matter enough to act on?"}</b>
              <p>
                {
                  "A decision, a budget, a staffing plan or a customer depends on it, so you want to know how sure the prediction is."
                }
              </p>
            </li>
          </ol>
          <a className="btn btn-primary" href="#pilot">
            {"Tell us your question"}
          </a>
        </div>
      </section>
      <section id="trust">
        <div className="wrap">
          <div className="sec-head">
            <span className="label">{"Validation & trust"}</span>
            <h2>{"Evidence your reviewers already ask for."}</h2>
            <p>
              {
                "Whether the reviewer is a bank's model-risk team, a clinical lead or a COO, LTFM shows its work."
              }
            </p>
          </div>
          <div className="gov-grid">
            <article className="gv">
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
              <ul>
                <li>{"Out-of-time backtests on your own history"}</li>
                <li>{"Side-by-side results against what you use today"}</li>
                <li>
                  {"Calibration: do 30% predictions happen 30% of the time?"}
                </li>
              </ul>
            </article>
            <article className="gv">
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
              <h3>{"Every prediction has reasons"}</h3>
              <ul>
                <li>{"Plain-language reasons per prediction"}</li>
                <li>
                  {"Ready for an analyst, an auditor or a customer letter"}
                </li>
              </ul>
            </article>
            <article className="gv">
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
              <ul>
                <li>{"Every prediction carries an uncertainty band"}</li>
                <li>{"Abstains on cases unlike anything it has seen"}</li>
                <li>{"Hands those to your current process"}</li>
              </ul>
            </article>
            <article className="gv">
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
                  fill="var(--canvas)"
                ></rect>
              </svg>
              <h3>{"Your data stays with you"}</h3>
              <ul>
                <li>{"Private deploy inside your environment"}</li>
                <li>{"Full audit trail of inputs and predictions"}</li>
              </ul>
            </article>
          </div>
          <div className="pilot-path" id="pilot-path">
            <span className="label">{"How every pilot runs"}</span>
            <ol className="steps big-steps">
              <li>
                <span className="label"></span>
                <b>{"Shadow mode"}</b>
                <p>
                  {
                    "LTFM runs inside your environment and predicts on live cases. Nothing it says changes a decision yet."
                  }
                </p>
              </li>
              <li>
                <span className="label"></span>
                <b>{"Side by side"}</b>
                <p>
                  {
                    "LTFM and your current approach are compared on the same cases: accuracy, calibration, stability over time."
                  }
                </p>
              </li>
              <li>
                <span className="label"></span>
                <b>{"Sign-off"}</b>
                <p>
                  {
                    "Your reviewers check the backtests, calibration and reasons, as for any model."
                  }
                </p>
              </li>
              <li className="live">
                <span className="label"></span>
                <b>{"LIVE"}</b>
                <p>
                  {
                    "LTFM predicts in production. Where it abstains, your current process still decides."
                  }
                </p>
              </li>
            </ol>
          </div>
        </div>
      </section>
      <section id="faq" className="rule-top">
        <div className="wrap faq-wrap">
          <div className="sec-head" style={{ marginBottom: "0" }}>
            <span className="label">{"Questions"}</span>
            <h2>{"What teams ask first."}</h2>
          </div>
          <div className="faq">
            <details open>
              <summary>{"Is LTFM only for banks?"}</summary>
              <p>
                {
                  "No. LTFM is for anyone who wants to predict from tables that change over time: insurance, healthcare, supply chain, retail, policy and more. We start with financial services because it has the richest records and the strictest review."
                }
              </p>
            </details>
            <details>
              <summary>{"Do we have to train a model on our data?"}</summary>
              <p>
                {
                  "No. LTFM is pre-trained across synthetic and real longitudinal systems and infers on new ones without retraining. Your table is the input to a single forward pass."
                }
              </p>
            </details>
            <details>
              <summary>{"What data does LTFM need?"}</summary>
              <p>
                {
                  "The tables you already keep: the things you track (customers, accounts, patients, shipments, products), how their state changes over time, and how they relate to each other."
                }
              </p>
            </details>
            <details>
              <summary>{"What if we don't have much history?"}</summary>
              <p>
                {
                  "That's where LTFM helps most. Priors from pre-training fill in where your data is thin, and the uncertainty band shows how much is known."
                }
              </p>
            </details>
            <details>
              <summary>{"How is it validated?"}</summary>
              <p>
                {
                  "Out-of-time backtests on your history, a side-by-side comparison with what you use today, and sign-off by your reviewers before it decides anything."
                }
              </p>
            </details>
            <details>
              <summary>{"What happens when LTFM isn't sure?"}</summary>
              <p>
                {
                  "Every prediction comes with a band. When a case is unlike anything it has seen, LTFM abstains and your current process handles it."
                }
              </p>
            </details>
            <details>
              <summary>{"Where does our data go?"}</summary>
              <p>
                {
                  "Nowhere. LTFM is deployed privately inside your environment, with a full audit trail."
                }
              </p>
            </details>
            <details>
              <summary>{"Can we use it today?"}</summary>
              <p>
                {
                  "The LTFM core is being built now and ships first to financial-services ML teams. We're taking pilot requests from every industry; each pilot starts in shadow mode."
                }
              </p>
            </details>
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
              <p>{"Five tables, one model, no retraining."}</p>
            </Link>
            <Link href="/research">
              <span className="label">{"Research"}</span>
              <b>
                {"How it works "}
                <span aria-hidden="true">{"→"}</span>
              </b>
              <p>{"Train once on synthetic worlds. Infer on yours."}</p>
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
