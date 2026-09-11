import * as React from "react";
import { OnboardingActionButton } from "./onboarding-action-button";

type PinStatus = "checking" | "pinned" | "unpinned" | "unavailable";
type SettingsChange = { isOnToolbar?: boolean };
type PinAction = {
  getUserSettings?: () => Promise<{ isOnToolbar: boolean }>;
  onUserSettingsChanged?: {
    addListener(listener: (change: SettingsChange) => void): void;
    removeListener(listener: (change: SettingsChange) => void): void;
  };
};

export function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m16 3 5 5-4 2-3 6-3-3-6 6M11 13l-3-3 6-3 2-4" />
    </svg>
  );
}

export function OnboardingPinStep({
  onContinue,
}: {
  onContinue(skipped: boolean): Promise<void>;
}) {
  const [status, setStatus] = React.useState<PinStatus>("checking");

  React.useEffect(() => {
    const action: PinAction | undefined =
      typeof chrome === "undefined" ? undefined : chrome.action;
    if (!action?.getUserSettings) {
      setStatus("unavailable");
      return;
    }

    let active = true;
    let pending = false;
    let revision = 0;
    const check = async () => {
      if (pending) return;
      pending = true;
      const startedRevision = revision;
      try {
        const settings = await action.getUserSettings?.();
        if (active && startedRevision === revision) {
          setStatus(settings?.isOnToolbar ? "pinned" : "unpinned");
        }
      } catch {
        if (active && startedRevision === revision) setStatus("unavailable");
      } finally {
        pending = false;
      }
    };
    const onChange = (change: SettingsChange) => {
      if (typeof change.isOnToolbar !== "boolean") return;
      revision += 1;
      setStatus(change.isOnToolbar ? "pinned" : "unpinned");
    };
    action.onUserSettingsChanged?.addListener(onChange);
    void check();
    // Poll while this step is mounted for browsers without the change event.
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, 1500);
    window.addEventListener("focus", check);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", check);
      action.onUserSettingsChanged?.removeListener(onChange);
    };
  }, []);

  return (
    <>
      <div className="stage-intro">
        <h1 id="onboarding-stage-title">Keep Knoww one click away.</h1>
        <p>
          Pin Knoww to your browser toolbar to see new market counts and open
          your markets whenever you need them.
        </p>
      </div>
      <div className="pin-guide">
        <div className="pin-menu-preview" aria-hidden="true">
          <div className="pin-menu-heading">Extensions</div>
          <div className="pin-menu-row">
            <span className="brand-mark" />
            <strong>Knoww</strong>
            <span className="pin-menu-target">
              <PinIcon />
            </span>
          </div>
          <small>Click the pin beside Knoww in your browser</small>
        </div>
        <ol className="pin-instructions">
          <li>Click the puzzle-piece icon in your browser toolbar.</li>
          <li>
            Find <strong>Knoww</strong> in the Extensions menu.
          </li>
          <li>
            Click the <strong>pin icon</strong> beside Knoww.
          </li>
        </ol>
      </div>
      <p className="action-notice" role="status">
        {status === "pinned"
          ? "Knoww is pinned. You're ready to continue."
          : status === "unavailable"
            ? "We can't check pin status in this browser. Follow the steps above, then continue."
            : status === "checking"
              ? "Checking whether Knoww is pinned…"
              : "Waiting for you to pin Knoww. This updates automatically."}
      </p>
      <div className="actions">
        <OnboardingActionButton
          className="primary-action"
          type="button"
          disabled={status !== "pinned"}
          onClick={() => onContinue(false)}
        >
          Continue <span aria-hidden="true">→</span>
        </OnboardingActionButton>
        {status !== "pinned" && (
          <OnboardingActionButton
            className="text-action"
            type="button"
            onClick={() => onContinue(true)}
          >
            {status === "unavailable"
              ? "Continue without verification"
              : "Skip for now"}
          </OnboardingActionButton>
        )}
      </div>
    </>
  );
}
