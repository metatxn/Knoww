"use client";
import { useEffect, useRef, useState } from "react";
import { DOMAINS, type Domain } from "./console-data";
import {
  formatProbability,
  type Prediction,
  rowsFor,
  score,
} from "./console-model";

const tabs: {
  id: Domain;
  label: string;
}[] = [
  { id: "lending", label: "Lending" },
  { id: "insurance", label: "Insurance" },
  { id: "health", label: "Healthcare" },
  { id: "supply", label: "Supply chain" },
  { id: "retail", label: "Retail" },
];
function Status({ result }: { result: Prediction }) {
  const [label, variant] = result.abstain
    ? ["Abstain", "out"]
    : result.p >= 0.3
      ? ["High", "err"]
      : result.p >= 0.1
        ? ["Watch", "warn"]
        : ["Low", "draft"];
  return <span className={`badge ${variant}`}>{label}</span>;
}
function Sparkline({ values }: { values: (number | null)[] }) {
  const points = values.flatMap((value, i) =>
    value === null ? [] : [`${4 + (i * 112) / 11},${28 - value * 24}`]
  );
  const last = points[points.length - 1]?.split(",");
  return (
    <svg className="spark" viewBox="0 0 120 32" aria-hidden="true">
      <line x1="0" x2="120" y1="28" y2="28" />
      <polyline points={points.join(" ")} />
      {last && <circle cx={last[0]} cy={last[1]} r="2.6" />}
    </svg>
  );
}
export function ModelConsole() {
  const [domain, setDomain] = useState<Domain>("lending");
  const [selected, setSelected] = useState<string | null>(null);
  const [passes, setPasses] = useState(1);
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );
  const data = DOMAINS[domain];
  const rows = rowsFor(domain).map((row) => ({
    ...row,
    result: score(row, domain),
  }));
  const best = rows.reduce((a, b) =>
    !b.result.abstain && (a.result.abstain || b.result.p > a.result.p) ? b : a
  );
  const active = rows.find((row) => row.id === selected) ?? best;
  const result = active.result;
  const maxReason = result.abstain
    ? 1
    : Math.max(...result.reasons.map(([weight]) => Math.abs(weight)), 1);
  function changeDomain(next: Domain) {
    if (next === domain) return;
    setDomain(next);
    setSelected(null);
    setPasses((value) => value + 1);
  }
  function run() {
    setPasses((value) => value + 1);
    setRunning(true);
    timer.current = setTimeout(() => setRunning(false), 650);
  }
  return (
    <div className={`console${running ? " scoring" : ""}`} id="ltfmConsole">
      <div className="c-bar">
        <div className="c-title">
          <b id="console-title">LTFM console</b>
          <span className="label">
            {data.file} · 8 {data.units} · 12 months
          </span>
        </div>
        <span className="badge out">Illustrative · synthetic {data.units}</span>
      </div>
      <div className="c-tools">
        <div className="c-tabs" role="tablist" aria-label="Table to score">
          {tabs.map((tab, index) => (
            <button
              role="tab"
              type="button"
              key={tab.id}
              id={`t-${tab.id}`}
              aria-selected={domain === tab.id}
              aria-controls="console-panel"
              tabIndex={domain === tab.id ? 0 : -1}
              onClick={() => changeDomain(tab.id)}
              onKeyDown={(event) => {
                const direction =
                  event.key === "ArrowRight"
                    ? 1
                    : event.key === "ArrowLeft"
                      ? -1
                      : 0;
                if (!direction && event.key !== "Home" && event.key !== "End")
                  return;
                event.preventDefault();
                const next =
                  tabs[
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : (index + direction + tabs.length) % tabs.length
                  ];
                changeDomain(next.id);
                document.getElementById(`t-${next.id}`)?.focus();
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="c-run">
          <button
            className="btn btn-primary btn-sm"
            type="button"
            disabled={running}
            onClick={run}
          >
            {running ? "Running forward pass…" : "Run one forward pass"}
          </button>
        </div>
      </div>
      <div role="tabpanel" id="console-panel" aria-labelledby={`t-${domain}`}>
        <div className="c-q">
          <span className="label">The question</span>
          <b>{data.q}</b>
        </div>
        <div className="c-body">
          <section className="c-table" aria-label={`${data.units} and scores`}>
            <table>
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col" className="r">
                    {data.ageCol}
                  </th>
                  <th scope="col">{data.sig.col}</th>
                  <th scope="col">{data.ev.col}</th>
                  <th scope="col" className="r">
                    {data.chg.col}
                  </th>
                  <th scope="col">Probability · 90% band</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    data-selected={active.id === row.id}
                    className={active.id === row.id ? "selected" : undefined}
                  >
                    <td>
                      <button
                        className="acct"
                        type="button"
                        aria-pressed={active.id === row.id}
                        onClick={() => setSelected(row.id)}
                      >
                        <b>{row.id}</b>
                        <span>{row.kind}</span>
                      </button>
                    </td>
                    <td className="r">{row.age}</td>
                    <td>
                      <span className="sr">
                        {data.sig.name}{" "}
                        {row.s
                          .filter((value): value is number => value !== null)
                          .map((value) => data.sig.f(value))
                          .join(", ")}
                      </span>
                      <Sparkline values={row.s} />
                    </td>
                    <td>
                      <span
                        className="pips"
                        aria-label={row.e
                          .split("")
                          .map((code) =>
                            code === "O"
                              ? data.ev.o
                              : code === "L"
                                ? data.ev.l
                                : code === "M"
                                  ? data.ev.m
                                  : "No history"
                          )
                          .join(", ")}
                        role="img"
                      >
                        {row.e.split("").map((code, i) => (
                          <i
                            key={i}
                            className={`pip ${{ O: "o", L: "l", M: "m", "-": "n" }[code]}`}
                            aria-hidden="true"
                          />
                        ))}
                      </span>
                    </td>
                    <td
                      className={`r${row.c !== null && row.c < 0 ? " inc-neg" : ""}`}
                    >
                      {row.c === null
                        ? "—"
                        : `${row.c > 0 ? "+" : ""}${row.c}%`}
                    </td>
                    <td>
                      <div className="score">
                        <b>
                          {row.result.abstain
                            ? "n/a"
                            : formatProbability(row.result.p)}
                        </b>
                        <div className="ibar">
                          {row.result.abstain ? (
                            <div className="ab" />
                          ) : (
                            <>
                              <div
                                className="band"
                                style={{
                                  left: `${row.result.lo * 100}%`,
                                  width: `${(row.result.hi - row.result.lo) * 100}%`,
                                }}
                              />
                              <div
                                className="pt"
                                style={{ left: `${row.result.p * 100}%` }}
                              />
                            </>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="status-cell">
                      <Status result={row.result} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="c-legend">
              {[
                ["o", data.ev.o],
                ["l", data.ev.l],
                ["m", data.ev.m],
                ["n", "No history"],
              ].map(([code, label]) => (
                <span key={code}>
                  <i className={`pip ${code}`} />
                  {label}
                </span>
              ))}
            </div>
          </section>
          <aside className="c-detail" aria-live="polite">
            <div className="d-head">
              <b>{active.id}</b>
              <span className="label">
                {active.kind} · {active.age} {data.ageUnit}
              </span>
            </div>
            {result.abstain ? (
              <>
                <div className="abstain-box">
                  <span className="label">LTFM abstains</span>
                  <b>Not enough to go on.</b>
                  <p>
                    One month of history, and a kind of {data.unit} this{" "}
                    {data.where} hasn't seen before. This {data.unit} goes to
                    your existing process.
                  </p>
                </div>
                <p className="calib">
                  A score is only returned when the model can say how sure it
                  is.
                </p>
              </>
            ) : (
              <>
                <div>
                  <span className="label">Probability of {data.label}</span>
                  <div className="big tnum">
                    {formatProbability(result.p)}
                    <small>
                      <Status result={result} />
                    </small>
                  </div>
                  <div className="band-t tnum">
                    90% band {result.lo.toFixed(2)} – {result.hi.toFixed(2)}
                  </div>
                </div>
                <div>
                  <span className="label">Reasons</span>
                  <ol className="reasons">
                    {result.reasons.map(([weight, reason]) => (
                      <li key={reason}>
                        <span>{reason}</span>
                        <em>{weight >= 0 ? "raises" : "lowers"}</em>
                        <span className="rb">
                          <i
                            className={weight < 0 ? "neg" : undefined}
                            style={{
                              width: `${(Math.abs(weight) / maxReason) * 100}%`,
                            }}
                          />
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
                <p className="calib">
                  Illustrative score. The probabilities and reasons demonstrate
                  the output format and are not model predictions.
                </p>
              </>
            )}
          </aside>
        </div>
      </div>
      <div className="c-foot tnum" aria-live="polite">
        <div>
          <span className="label">{data.units} scored</span>
          <b>{rows.filter((row) => !row.result.abstain).length}</b>
        </div>
        <div>
          <span className="label">Abstained</span>
          <b>{rows.filter((row) => row.result.abstain).length}</b>
        </div>
        <div>
          <span className="label">Models trained for this table</span>
          <b>0</b>
        </div>
        <div>
          <span className="label">Forward passes</span>
          <b>{passes}</b>
        </div>
      </div>
    </div>
  );
}
