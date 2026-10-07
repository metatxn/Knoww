import type { EventTeam } from "@/hooks/use-event-detail";
import type { OutcomeData } from "@/types/market";

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function teamShortName(team: EventTeam): string {
  const explicit = team.abbreviation?.trim();
  if (explicit) return explicit.toUpperCase();
  const firstWord = team.name.trim().split(/\s+/)[0] || team.name;
  return firstWord.slice(0, 3).toUpperCase();
}

function matchTeam(
  rawValue: string | undefined,
  teams: readonly EventTeam[] | undefined
): EventTeam | undefined {
  const normalized = normalizeText(rawValue ?? "");
  if (!normalized || !teams || normalized === "yes" || normalized === "no")
    return undefined;

  const candidates = teams.map((team) => ({
    team,
    names: [team.name, team.abbreviation ?? "", team.alias ?? ""]
      .map(normalizeText)
      .filter(Boolean),
  }));
  const exactMatches = candidates.filter(({ names }) =>
    names.includes(normalized)
  );
  if (exactMatches.length > 0)
    return exactMatches.length === 1 ? exactMatches[0].team : undefined;

  // An abbreviation such as IND must not match inside Indies.
  const phrase = ` ${normalized} `;
  const phraseMatches = candidates.filter(({ names }) =>
    names.some((name) => phrase.includes(` ${name} `))
  );
  return phraseMatches.length === 1 ? phraseMatches[0].team : undefined;
}

export function compactMatchupOutcomeName(
  rawName: string,
  teams: readonly EventTeam[] | undefined
): string {
  const team = matchTeam(rawName, teams);
  if (team) return teamShortName(team);

  return rawName.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

export function compactMatchupTradingOutcomes(
  outcomes: readonly OutcomeData[],
  teams?: readonly EventTeam[]
): OutcomeData[] {
  return outcomes.map((outcome) => ({
    ...outcome,
    name: compactMatchupOutcomeName(outcome.name, teams),
  }));
}
