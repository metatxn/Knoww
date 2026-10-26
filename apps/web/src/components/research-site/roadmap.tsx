import { Fragment } from "react";

export function Roadmap() {
  const rows = [
    {
      name: "Hiring · 4 wks",
      note: "",
      start: 0,
      end: 0.92,
      kind: "solid",
      annotation: "resource the team",
      at: 1.2,
    },
    {
      name: "Feasibility · 16 wks",
      note: "",
      start: 1.1,
      end: 4.8,
      kind: "outline",
      annotation: "← go / no-go at week 8: beat GBMs",
      at: 5.1,
      marker: 2.9,
    },
    {
      name: "LTFM v1 · LSM + Intel.",
      note: "LTFM's internal state",
      start: 0,
      end: 9,
      kind: "hatch",
      annotation: "→ grows into full LTFM",
      at: 9.2,
    },
    {
      name: "Pilots",
      note: "shadow mode → live",
      start: 9,
      end: 18,
      kind: "cit",
    },
    {
      name: "LTFM v2 · full platform",
      note: "same core, every industry",
      start: 18,
      end: 24,
      kind: "solid",
    },
    {
      name: "Open research",
      note: "intake every 8 weeks",
      start: 0,
      end: 24,
      kind: "ticks",
    },
  ];
  const percent = (month: number) => `${(month / 24) * 100}%`;
  return (
    <div
      className="gantt"
      role="img"
      aria-label="Proposed 24-month roadmap. Hiring and feasibility first, LTFM v1 by month 9, pilots from months 9 to 18, and the full platform from months 18 to 24. Open research intake every eight weeks."
    >
      <div />
      <div className="axis">
        {[0, 4, 8, 12, 16, 20, 24].map((month) => (
          <span key={month} style={{ left: percent(month) }}>
            {month === 24 ? "24 MO" : month}
          </span>
        ))}
      </div>
      {rows.map((row) => (
        <Fragment key={row.name}>
          <div className="nm">
            <b>{row.name}</b>
            {row.note && <i>{row.note}</i>}
          </div>
          <div className="tr">
            {row.kind === "ticks" ? (
              Array.from({ length: 14 }, (_, i) => (
                <div
                  key={i}
                  className="tick"
                  style={{
                    left: `calc(${percent(Math.min((i * 8) / 4.333, 24))} - 1px)`,
                  }}
                />
              ))
            ) : (
              <div
                className={`bar ${row.kind}`}
                style={{
                  left: percent(row.start),
                  width: percent(row.end - row.start),
                }}
              />
            )}
            {row.marker && (
              <div className="mk" style={{ left: percent(row.marker) }} />
            )}
            {row.annotation && (
              <span className="ann" style={{ left: percent(row.at) }}>
                {row.annotation}
              </span>
            )}
          </div>
        </Fragment>
      ))}
    </div>
  );
}
