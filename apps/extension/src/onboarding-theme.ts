export const ONBOARDING_THEME_COLORS = {
  "--bg": "--kw-bg",
  "--panel": "--kw-bg-card",
  "--panel-soft": "--kw-bg-alt",
  "--text": "--kw-fg",
  "--green": "--kw-accent-text",
  "--danger": "--kw-danger-text",
} as const;

export function applyOnboardingTheme(
  event: MessageEvent,
  parentWindow: Window,
  parentOrigin: string,
  root: HTMLElement = document.documentElement
): void {
  if (
    event.source !== parentWindow ||
    event.origin !== parentOrigin ||
    event.data?.type !== "knoww:onboarding-theme"
  )
    return;
  const { colors, colorScheme } = event.data;
  if (
    !colors ||
    typeof colors !== "object" ||
    (colorScheme !== "light" && colorScheme !== "dark")
  )
    return;
  const entries = Object.keys(ONBOARDING_THEME_COLORS).map((key) => [
    key,
    colors[key],
  ]);
  if (
    entries.some(
      ([, value]) =>
        typeof value !== "string" ||
        value.length > 128 ||
        !CSS.supports("color", value)
    )
  )
    return;
  for (const [key, value] of entries) root.style.setProperty(key, value);
  root.style.colorScheme = colorScheme;
  root.classList.add("onboarding-themed");
}
