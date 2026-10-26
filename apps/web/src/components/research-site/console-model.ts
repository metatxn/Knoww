import { DOMAINS, type Domain, HISTORIES, type History } from "./console-data";

export type RecordRow = History & { id: string; kind: string };
export type Prediction =
  | { abstain: true }
  | {
      abstain: false;
      p: number;
      lo: number;
      hi: number;
      reasons: [number, string][];
    };
export function rowsFor(domain: Domain): RecordRow[] {
  const data = DOMAINS[domain];
  return data.order.map((index, i) => ({
    ...HISTORIES[index],
    id: data.ids[i],
    kind: data.kinds[i],
  }));
}
function countedPhrase(count: number, phrase: string) {
  if (count !== 1) return phrase;
  return /ies( |$)/.test(phrase)
    ? phrase.replace(/ies( |$)/, "y$1")
    : phrase.replace(/s( |$)/, "$1");
}
export function score(row: RecordRow, domain: Domain): Prediction {
  if (row.novel) return { abstain: true };
  const d = DOMAINS[domain];
  const values = row.s.filter((value): value is number => value !== null);
  if (!values.length) return { abstain: true };
  const first = values[0],
    last = values[values.length - 1],
    rise = last - first;
  const events = row.e.split("");
  const bad = events
    .slice(-3)
    .filter((value) => value === "L" || value === "M").length;
  const severe = events.filter((value) => value === "M").length;
  const good = events.filter((value) => value === "O").length;
  const history = events.filter((value) => value !== "-").length;
  const terms: [number, string][] = [
    [2.4 * (last - 0.35), `${d.sig.name} at ${d.sig.f(last)}`],
  ];
  if (Math.abs(rise) > 0.08)
    terms.push([
      1.6 * rise,
      `${d.sig.name} ${rise > 0 ? "up" : "down"} from ${d.sig.f(first)} to ${d.sig.f(last)} in 12 months`,
    ]);
  if (bad)
    terms.push([
      0.5 * bad,
      `${bad} ${countedPhrase(bad, d.ev.bad)} in the last 3 months`,
    ]);
  if (severe)
    terms.push([
      0.6 * severe,
      `${severe} ${countedPhrase(severe, d.ev.sev)} this year`,
    ]);
  if (!bad && !severe && good >= 6)
    terms.push([-0.9, `${good} of ${history} ${d.ev.good}`]);
  if (row.c)
    terms.push([
      -0.045 * row.c,
      `${d.chg.name} ${row.c < 0 ? "down" : "up"} ${Math.abs(row.c)}%`,
    ]);
  if (row.age >= 36) terms.push([-0.4, `${row.age} ${d.ageUnit}`]);
  if (row.age < 12 && history >= 3)
    terms.push([0.3, `Only ${row.age} ${d.ageUnit}`]);
  let hash = 0;
  for (const character of row.id)
    hash = (hash * 31 + character.charCodeAt(0)) % 997;
  const z =
    -3.8 +
    d.bias +
    (hash / 997 - 0.5) * 0.9 +
    terms.reduce((sum, [weight]) => sum + weight, 0);
  const p = 1 / (1 + Math.exp(-z));
  const width = Math.min(
    0.25,
    1.64 * Math.sqrt((p * (1 - p)) / (6 + history * 2.2 + row.age * 0.6)) + 0.01
  );
  return {
    abstain: false,
    p,
    lo: Math.max(0, p - width),
    hi: Math.min(1, p + width),
    reasons: terms.sort((a, b) => Math.abs(b[0]) - Math.abs(a[0])).slice(0, 4),
  };
}
export function formatProbability(value: number) {
  return value < 0.005 ? "<0.01" : value.toFixed(2);
}
