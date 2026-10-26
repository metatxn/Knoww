import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { posterior, seedPoints } from "./gaussian-process";
import { ModelConsole } from "./model-console";
import { PilotRequest } from "./pilot-request";

describe("LTFM landing interactions", () => {
  it("switches industry tables and explains why novel records are not scored", () => {
    render(<ModelConsole />);
    expect(
      screen.getByText("Will this account default within 90 days?")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /AC-40263/ }));
    expect(screen.getByText("Not enough to go on.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Supply chain" }));
    expect(
      screen.getByText("Will this shipment arrive late?")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /SH-7701/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /AC-40263/ })
    ).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Supply chain" }), {
      key: "ArrowRight",
    });
    expect(screen.getByRole("tab", { name: "Retail" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("validates a pilot request, prepares it without sending, and preserves edits", () => {
    render(<PilotRequest />);
    fireEvent.click(
      screen.getByRole("button", { name: "Prepare pilot request" })
    );
    expect(screen.getByLabelText("Organisation")).toHaveFocus();
    expect(screen.getByLabelText("Organisation")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    fireEvent.change(screen.getByLabelText("Organisation"), {
      target: { value: "Example team" },
    });
    fireEvent.change(screen.getByLabelText("The question"), {
      target: { value: "Will this shipment be late?" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Prepare pilot request" })
    );
    expect(screen.getByText(/Organisation: Example team/)).toBeInTheDocument();
    expect(
      screen
        .getByRole("link", { name: "Open email draft" })
        .getAttribute("href")
    ).toMatch(/^mailto:invest@knoww.app\?/);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Organisation")).toHaveValue("Example team");
  });

  it("keeps themed dropdown selections in the prepared pilot request", async () => {
    render(<PilotRequest />);
    fireEvent.keyDown(screen.getByRole("button", { name: /Industry/ }), {
      key: "ArrowDown",
    });
    fireEvent.click(
      await screen.findByRole("menuitemradio", { name: "Insurance" })
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Industry Insurance/ })
      ).toHaveFocus()
    );
    fireEvent.keyDown(screen.getByRole("button", { name: /Current model/ }), {
      key: "ArrowDown",
    });
    fireEvent.click(
      await screen.findByRole("menuitemradio", { name: "Spreadsheet or rules" })
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Current model/ })
      ).toHaveTextContent("Spreadsheet or rules")
    );
    fireEvent.change(screen.getByLabelText("Organisation"), {
      target: { value: "Example team" },
    });
    fireEvent.change(screen.getByLabelText("The question"), {
      target: { value: "Is this claim genuine?" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Prepare pilot request" })
    );
    expect(screen.getByText(/Industry: Insurance/)).toHaveTextContent(
      "Today we use: Spreadsheet or rules"
    );
  });

  it("keeps probability bands wider where observations are missing", () => {
    const points = seedPoints();
    const [observed, missing] = posterior(points, [points[0].x, 0.5]);
    expect(observed.s).toBeLessThan(missing.s);
    const [updated] = posterior([...points, { x: 0.5, y: 0.4 }], [0.5]);
    expect(updated.s).toBeLessThan(missing.s);
    expect(Number.isFinite(updated.m)).toBe(true);
  });
});
