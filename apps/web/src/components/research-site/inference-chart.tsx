"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type Observation,
  posterior,
  seedPoints,
  truth,
} from "./gaussian-process";

const xs = Array.from({ length: 161 }, (_, i) => i / 160);
export function InferenceChart({ hero = false }: { hero?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const figure = useRef<HTMLElement>(null);
  const [points, setPoints] = useState(seedPoints);
  const [playing, setPlaying] = useState(false);
  const estimates = useMemo(() => posterior(points, xs), [points]);
  const widest = Math.max(...estimates.map((point) => point.s));
  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    if (hero && !motion.matches) setPlaying(true);
    const change = () => {
      if (motion.matches) setPlaying(false);
    };
    motion.addEventListener("change", change);
    return () => motion.removeEventListener("change", change);
  }, [hero]);
  useEffect(() => {
    if (!playing) return;
    let visible = true;
    const observer = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
    });
    if (figure.current) observer.observe(figure.current);
    const timer = setInterval(() => {
      if (!visible || document.hidden) return;
      setPoints((current) => {
        if (current.length >= 14) return seedPoints();
        const post = posterior(current, xs);
        const best = post.reduce(
          (winner, point, i) => (point.s > post[winner].s ? i : winner),
          0
        );
        return [...current, { x: xs[best], y: truth(xs[best]) }];
      });
    }, 2400);
    return () => {
      clearInterval(timer);
      observer.disconnect();
    };
  }, [playing]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const context = element.getContext("2d");
    if (!context) return;
    function draw() {
      if (!element || !context) return;
      const rect = element.getBoundingClientRect();
      const scale = Math.min(devicePixelRatio || 1, 2);
      element.width = Math.max(1, Math.round(rect.width * scale));
      element.height = Math.max(1, Math.round(rect.height * scale));
      context.setTransform(scale, 0, 0, scale, 0, 0);
      const w = rect.width,
        h = rect.height,
        left = 12,
        top = 16,
        bottom = 28;
      const X = (x: number) => left + x * (w - left * 2);
      const Y = (y: number) => top + ((1.9 - y) / 3.8) * (h - top - bottom);
      const styles = getComputedStyle(element);
      const color = (key: string) => styles.getPropertyValue(key).trim();
      context.clearRect(0, 0, w, h);
      context.strokeStyle = hero ? "rgba(20,22,26,.1)" : color("--panel-rule");
      context.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = top + (i * (h - top - bottom)) / 4;
        context.beginPath();
        context.moveTo(left, y);
        context.lineTo(w - left, y);
        context.stroke();
      }
      context.beginPath();
      estimates.forEach((point, i) => {
        const x = X(xs[i]),
          y = Y(point.m + 1.96 * point.s);
        if (i) context.lineTo(x, y);
        else context.moveTo(x, y);
      });
      for (let i = estimates.length - 1; i >= 0; i--)
        context.lineTo(X(xs[i]), Y(estimates[i].m - 1.96 * estimates[i].s));
      context.closePath();
      context.fillStyle = hero
        ? "rgba(111,163,160,.26)"
        : "rgba(233,180,76,.20)";
      context.fill();
      context.strokeStyle = hero ? color("--k2") : color("--citron");
      context.globalAlpha = 0.7;
      context.stroke();
      context.globalAlpha = 1;
      context.beginPath();
      estimates.forEach((point, i) => {
        if (i) context.lineTo(X(xs[i]), Y(point.m));
        else context.moveTo(X(xs[i]), Y(point.m));
      });
      context.strokeStyle = hero ? color("--k4") : color("--citron");
      context.lineWidth = 2.6;
      context.stroke();
      for (const point of points) {
        context.beginPath();
        context.arc(X(point.x), Y(point.y), 5, 0, Math.PI * 2);
        context.fillStyle = hero ? color("--h-bg") : color("--panel");
        context.fill();
        context.lineWidth = 2;
        context.strokeStyle = hero ? color("--h-ink") : color("--panel-text");
        context.stroke();
      }
      if (hero && widest > 0.35) {
        const index = estimates.findIndex((point) => point.s === widest);
        const x = Math.max(92, Math.min(w - 92, X(xs[index])));
        context.fillStyle = color("--h-muted");
        context.font = `11px ${color("--research-font-mono")}`;
        context.textAlign = "center";
        context.fillText("no data → wider band", x, h - bottom - 10);
      }
      context.fillStyle = hero ? color("--h-muted") : color("--panel-muted");
      context.font = `11px ${color("--research-font-mono")}`;
      context.textAlign = "right";
      context.fillText("time →", w - left, h - 7);
    }
    const resize = new ResizeObserver(draw);
    resize.observe(element);
    draw();
    let active = true;
    void document.fonts.ready.then(() => {
      if (active) draw();
    });
    return () => {
      active = false;
      resize.disconnect();
    };
  }, [points, estimates, hero, widest]);
  function addPoint(point?: Observation) {
    setPlaying(false);
    setPoints((current) => {
      if (point) return [...current.slice(-39), point];
      const post = posterior(current, xs);
      const best = post.reduce(
        (winner, item, i) => (item.s > post[winner].s ? i : winner),
        0
      );
      return [...current.slice(-39), { x: xs[best], y: truth(xs[best]) }];
    });
  }
  const graph = (
    <canvas
      ref={canvas}
      role="img"
      aria-label="Gaussian process illustration. Observed points, predicted curve and 95% uncertainty band. Use Add a point to add an observation."
      onClick={(event) => {
        const r = event.currentTarget.getBoundingClientRect();
        addPoint({
          x: Math.max(
            0.01,
            Math.min(0.99, (event.clientX - r.left - 12) / (r.width - 24))
          ),
          y: Math.max(
            -1.8,
            Math.min(
              1.8,
              1.9 - ((event.clientY - r.top - 16) / (r.height - 44)) * 3.8
            )
          ),
        });
      }}
    />
  );
  const actions = (
    <div className="chart-actions flex flex-wrap gap-2">
      <button
        className="btn btn-secondary btn-sm"
        type="button"
        onClick={() => addPoint()}
      >
        Add a point
      </button>
      <button
        className="btn btn-secondary btn-sm"
        type="button"
        onClick={() => {
          setPoints(seedPoints());
          setPlaying(false);
        }}
      >
        Reset
      </button>
      {hero && (
        <button
          className="btn btn-secondary btn-sm chart-toggle"
          type="button"
          aria-pressed={playing}
          onClick={() => setPlaying(!playing)}
        >
          {playing ? "Pause" : "Play"}
        </button>
      )}
    </div>
  );
  const readout = (
    <div className={hero ? "hx-readout tnum" : "readout tnum"}>
      <div>
        <span className="label">observations</span>
        <b>{points.length}</b>
      </div>
      <div>
        <span className="label">retraining runs</span>
        <b>0</b>
      </div>
      <div>
        <span className="label">widest band</span>
        <b>±{(1.96 * widest).toFixed(2)}</b>
      </div>
    </div>
  );
  return (
    <figure
      ref={figure}
      className={hero ? "hx-infer" : "demo"}
      aria-label="Infer in one forward pass"
    >
      {hero ? (
        <div className="hx-step">
          <span className="hx-n">02</span>
          <b>Infer · one forward pass</b>
          <div className="hx-legend" aria-hidden="true">
            <span>
              <i className="pt" />
              observed
            </span>
            <span>
              <i className="ln" />
              predicted
            </span>
            <span>
              <i className="bd" />
              95% band
            </span>
          </div>
          <span className="hx-live">
            <i />
            {playing ? "live" : "paused"}
          </span>
        </div>
      ) : (
        <div className="demo-top">
          <span className="label">Try it: add an observation</span>
        </div>
      )}
      {hero ? <div className="hx-chart">{graph}</div> : graph}
      {readout}
      <div className={hero ? "hx-foot" : "demo-foot"}>
        <span>
          {hero ? (
            <>
              Show it new data. It <strong>finds the curve</strong> and says how
              sure it is, with no retraining.
            </>
          ) : (
            "Where there is no data, the band widens. Add a point and it narrows instantly."
          )}
        </span>
        {actions}
      </div>
      {hero && (
        <figcaption className="hx-src">
          PFNs · Müller et al., 2022 · illustrated with a Gaussian process
        </figcaption>
      )}
    </figure>
  );
}
