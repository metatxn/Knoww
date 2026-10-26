import Link from "next/link";
import { CopyButton } from "./copy-button";
import { PilotRequest } from "./pilot-request";
import { Roadmap } from "./roadmap";
export function CompanyContent() {
  return (
    <main id="main">
      <section className="page-hero" style={{ paddingBlock: "48px 64px" }}>
        <div className="wrap">
          <p className="crumbs">
            <Link href="/">{"Knoww"}</Link>
            {" / Company"}
          </p>
          <h1 className="mega">
            {"Every business is trying to "}
            <span className="mark">{"see tomorrow."}</span>
          </h1>
          <p className="lede">
            <strong>
              {
                "Knoww Research Lab builds LTFM, a new kind of foundation model for anyone who wants to predict from the tables every industry runs on."
              }
            </strong>
            {
              " We start with financial services, which keeps the richest longitudinal records and holds every model to the highest bar."
            }
          </p>
          <nav className="jump" aria-label="On this page">
            <a href="#story">
              {"How we found it "}
              <span aria-hidden="true">{"↓"}</span>
            </a>
            <a href="#team">
              {"Team "}
              <span aria-hidden="true">{"↓"}</span>
            </a>
            <a href="#roadmap">
              {"Roadmap "}
              <span aria-hidden="true">{"↓"}</span>
            </a>
            <a href="#contact">
              {"Contact "}
              <span aria-hidden="true">{"↓"}</span>
            </a>
          </nav>
        </div>
      </section>
      <section id="story">
        <div className="wrap">
          <div className="sec-head">
            <span className="label">{"How we found it"}</span>
            <h2>{"Every answer led to a deeper question."}</h2>
            <p>{"The company is the last step in this chain."}</p>
          </div>
          <ol className="timeline">
            <li>
              <span className="label">{"01"}</span>
              <p>
                {"We predicted imported macro events in one month. "}
                <strong>{"17 of 22 were right."}</strong>
              </p>
            </li>
            <li>
              <span className="label">{"02"}</span>
              <p>
                {"We asked: why can't a model do this "}
                <strong>{"natively"}</strong>
                {"?"}
              </p>
            </li>
            <li>
              <span className="label">{"03"}</span>
              <p>
                {"LLMs don't truly understand "}
                <strong>{"time or tables"}</strong>
                {"."}
              </p>
            </li>
            <li>
              <span className="label">{"04"}</span>
              <p>
                {"That insight opened the door to "}
                <strong>{"causal foundation models"}</strong>
                {"."}
              </p>
            </li>
            <li>
              <span className="label">{"05"}</span>
              <p>
                {"We found that SAP had just acquired "}
                <strong>{"Prior Labs"}</strong>
                {"."}
              </p>
            </li>
            <li className="now">
              <span className="label">{"06 · Now"}</span>
              <p>
                <strong>
                  {
                    "We begin the work: one model that learns to learn and understands tables natively."
                  }
                </strong>
              </p>
            </li>
          </ol>
          <p className="statement" style={{ marginTop: "64px" }}>
            <span className="dim">{"That last step"}</span>
            {" is the whole company."}
          </p>
        </div>
      </section>
      <section id="team" className="panel">
        <div className="wrap">
          <div className="sec-head">
            <span className="label c">{"Team"}</span>
            <h2>{"40+ years building financial products and risk models."}</h2>
            <p>
              {
                "Before writing a line of LTFM, we read and connected the 25 papers it stands on."
              }
            </p>
          </div>
          <div className="team">
            <article className="person">
              <span className="av f" aria-hidden="true">
                {"VS"}
              </span>
              <div>
                <h3>{"Vikas Singh"}</h3>
                <span className="label">{"Founder & CEO"}</span>
                <p>{"8 years in blockchain and finance."}</p>
              </div>
            </article>
            <article className="person">
              <span className="av" aria-hidden="true">
                {"MT"}
              </span>
              <div>
                <h3>{"Mayank Tondak"}</h3>
                <span className="label">{"Credit risk"}</span>
                <p>{"Built credit-risk models at EXL."}</p>
              </div>
            </article>
            <article className="person">
              <span className="av" aria-hidden="true">
                {"RS"}
              </span>
              <div>
                <h3>{"Ravi Kumar Singh"}</h3>
                <span className="label">{"Longitudinal ML"}</span>
                <p>{"Built a longitudinal ML model for education."}</p>
              </div>
            </article>
          </div>
          <div className="team-foot">
            <div>
              <b className="tnum">{"25"}</b>
              <span>{"papers read & connected"}</span>
            </div>
            <div>
              <b className="tnum">{"40+"}</b>
              <span>
                {"years combined in financial products & risk models"}
              </span>
            </div>
            <div>
              <b className="tnum">{"17/22"}</b>
              <span>{"macro calls right in experiment one"}</span>
            </div>
          </div>
        </div>
      </section>
      <section id="roadmap">
        <div className="wrap">
          <div className="sec-head">
            <span className="label">{"Roadmap · 24 months"}</span>
            <h2>{"Hire in 4 weeks. Prove in 16. Scale in 24 months."}</h2>
            <p>
              {
                "A go/no-go gate at week 8: LTFM has to beat gradient-boosted models before we scale."
              }
            </p>
          </div>
          <section
            className="gantt-scroll"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll the wide roadmap.
            tabIndex={0}
            aria-label="24-month roadmap"
          >
            <Roadmap />
          </section>
          <p className="cite" style={{ marginTop: "16px" }}>
            {"| = open-research intake every 8 weeks"}
          </p>
        </div>
      </section>
      <section id="contact" className="rule-top">
        <div className="wrap contact">
          <h2 className="mega">
            {"Help us build "}
            <span className="mark">{"LTFM."}</span>
          </h2>
          <div className="ct">
            <div className="ct-r">
              <span className="label">{"Teams that predict"}</span>
              <p>
                {
                  "Pilot LTFM in shadow mode next to what you use today, in any industry."
                }
              </p>
              <a className="textlink" href="#pilot">
                {"Request a pilot "}
                <span aria-hidden="true">{"→"}</span>
              </a>
            </div>
            <div className="ct-r">
              <span className="label">{"Researchers"}</span>
              <p>
                {
                  "Work on tabular and longitudinal foundation models. Intake opens every 8 weeks."
                }
              </p>
            </div>
            <div className="ct-r">
              <span className="label">{"Everyone else"}</span>
              <div className="copyrow">
                <code id="email2">{"invest@knoww.app"}</code>
                <CopyButton targetId="email2" />
              </div>
              <p className="status" data-status="email2" aria-live="polite"></p>
            </div>
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
              <p>{"One model, three questions, the same accounts."}</p>
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
            <Link href="/research">
              <span className="label">{"Research"}</span>
              <b>
                {"How it works "}
                <span aria-hidden="true">{"→"}</span>
              </b>
              <p>{"Train once on synthetic worlds. Infer on yours."}</p>
            </Link>
          </nav>
        </div>
      </section>
    </main>
  );
}
