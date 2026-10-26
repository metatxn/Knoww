export function EvidenceDots() {
  return (
    <div
      className="research-evidence-dots"
      role="img"
      aria-label="22 dated calls. 17 right, shown filled, and 5 wrong, shown open."
    >
      {"1101111011101110111101".split("").map((bit, i) => (
        <i key={i} className={bit === "1" ? "r" : undefined} />
      ))}
    </div>
  );
}

type Release = [number, number, string?];
const llm: Release[] = [
  [115, 5],
  [170, 7],
  [198, 7.5],
  [226, 8.5],
  [258, 10],
  [264, 11, "ChatGPT"],
  [280, 12.5],
  [318, 13.5],
  [406, 14, "LLaMA"],
  [440, 15],
  [450, 16],
  [456, 17, "GPT-4"],
  [488, 18],
  [510, 19],
  [516, 20, "Llama 2"],
  [566, 21],
  [592, 22.5],
  [604, 24, "Gemini"],
  [620, 25],
  [628, 26, "Mixtral"],
];
const tabular: Release[] = [
  [115, 2],
  [225, 2],
  [236, 3, "TabPFNv2"],
  [297, 4, "KumoRFM"],
  [362, 5],
  [390, 6, "TabPFN-2.5"],
  [456, 7],
  [466, 8, "NEXUS"],
  [527, 10, "KumoRFM-2"],
  [542, 11],
  [566, 12, "TabFM"],
  [576, 13],
  [580, 14],
  [585, 15, "TabPFN-3"],
  [587, 17, "LimiX-2"],
];
const X = (x: number) => 60 + ((x - 110) / 570) * 620;
const Y = (y: number) => 360 - y * 12.4;
export function ReleaseCurve() {
  return (
    <svg
      id="curve"
      viewBox="0 0 720 420"
      role="img"
      aria-label="Illustrative comparison of model releases. LLM releases from 2021 to 2024 and tabular model releases from 2024 to 2026, with the axes shifted three years."
      style={{ color: "var(--text)", fontFamily: "var(--research-font-mono)" }}
    >
      <defs>
        <pattern
          id="release-hatch"
          width="8"
          height="8"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="8"
            stroke="var(--border-subtle)"
            strokeWidth="2"
          />
        </pattern>
      </defs>
      <rect
        x={X(444)}
        y={Y(26.5)}
        width={X(680) - X(444)}
        height={Y(0) - Y(26.5)}
        fill="url(#release-hatch)"
      />
      <text x={X(450)} y={Y(26.5) + 14} fill="currentColor" fontSize="10">
        NOW FOR TABULAR
      </text>
      {[0, 5, 10, 15, 20, 25].map((value) => (
        <g key={value}>
          <line
            x1="60"
            x2="680"
            y1={Y(value)}
            y2={Y(value)}
            stroke="var(--border-subtle)"
          />
          <text
            x="48"
            y={Y(value) + 4}
            textAnchor="end"
            fill="var(--text-muted)"
            fontSize="12"
          >
            {value}
          </text>
        </g>
      ))}
      <path
        d={`M60 ${Y(27)} V360 H680`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {[
        { x: 214, first: "Jan 2022", second: "Jan 2025" },
        { x: 444, first: "Jan 2023", second: "Jan 2026" },
      ].map((tick) => (
        <g key={tick.x}>
          <text
            x={X(tick.x)}
            y="382"
            textAnchor="middle"
            fill="currentColor"
            fontSize="12"
            fontWeight="700"
          >
            {tick.first}
          </text>
          <text
            x={X(tick.x)}
            y="398"
            textAnchor="middle"
            fill="var(--text-muted)"
            fontSize="12"
          >
            {tick.second}
          </text>
        </g>
      ))}
      {[llm, tabular].map((series, index) => (
        <g key={index}>
          <polyline
            points={series.map(([x, y]) => `${X(x)},${Y(y)}`).join(" ")}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray={index ? "7 5" : undefined}
          />
          {series.slice(1).map(([x, y, label], i) => (
            <g key={i}>
              <circle
                cx={X(x)}
                cy={Y(y)}
                r="4.5"
                fill={index ? "var(--canvas)" : "currentColor"}
                stroke="currentColor"
                strokeWidth="1.5"
              />
              {label && (
                <text
                  x={X(x) + (index ? 8 : -8)}
                  y={Y(y) + (index ? 16 : -10)}
                  textAnchor={index ? "start" : "end"}
                  fill="currentColor"
                  fontSize={index ? 12 : 13}
                >
                  {label}
                </text>
              )}
            </g>
          ))}
        </g>
      ))}
    </svg>
  );
}
