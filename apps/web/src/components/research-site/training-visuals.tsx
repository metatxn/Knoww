export function SyntheticWorlds({ research = false }: { research?: boolean }) {
  return (
    <div className={research ? "cells" : "hx-cells"} aria-hidden="true">
      {Array.from({ length: 9 }, (_, index) => {
        const fn = (x: number) =>
          index % 3 === 0
            ? 0.5 * Math.sin(x * (6 + index) + index)
            : index % 3 === 1
              ? (x - 0.5) * (index % 2 ? 1.5 : -1.5) + Math.sin(x * 8) * 0.15
              : 3 * (x - 0.5) ** 2 - 0.5;
        const points = Array.from(
          { length: 41 },
          (_, i) => `${10 + i * 4.5},${75 - fn(i / 40) * 45}`
        ).join(" ");
        return (
          <svg
            key={index}
            viewBox="0 0 200 150"
            className="synthetic-world"
            aria-hidden="true"
          >
            <polyline
              points={points}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              opacity="0.4"
            />
            {Array.from({ length: 7 }, (_, i) => {
              const x = ((i * 17 + index * 13) % 97) / 100;
              return (
                <circle
                  key={i}
                  cx={10 + x * 180}
                  cy={75 - fn(x) * 45}
                  r="5"
                  fill={`var(--k${2 + (index % 3)})`}
                />
              );
            })}
          </svg>
        );
      })}
    </div>
  );
}
export function DataStreams() {
  return (
    <svg
      className="hx-bg"
      viewBox="0 0 1400 700"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {Array.from({ length: 26 }, (_, i) => (
        <path
          key={i}
          className="data-stream"
          d={`M 0 ${i * 28} Q 650 ${i * 24} 1400 ${350 + i * 7}`}
          fill="none"
          stroke={`var(--k${1 + (i % 4)})`}
          strokeWidth={i % 3 ? 1 : 2}
          strokeDasharray="8 84"
          style={{ animationDelay: `${-i * 0.4}s` }}
        />
      ))}
    </svg>
  );
}
