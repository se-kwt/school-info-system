// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PeriodsView } from "../src/components/timetable/PeriodsView";

describe("PeriodsView", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("rejects a period whose end time precedes its start", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<PeriodsView initialPeriods={[]} />);

    await userEvent.type(screen.getByLabelText("Label"), "Period 1");
    const startInput = screen.getByLabelText("Start time");
    await userEvent.clear(startInput);
    await userEvent.type(startInput, "10:00");
    const endInput = screen.getByLabelText("End time");
    await userEvent.clear(endInput);
    await userEvent.type(endInput, "09:00");
    await userEvent.click(screen.getByRole("button", { name: /add period/i }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/start time must be before end time/i)).toBeInTheDocument();
  });

  it("rejects a period with an empty label", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<PeriodsView initialPeriods={[]} />);

    await userEvent.click(screen.getByRole("button", { name: /add period/i }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/label is required/i)).toBeInTheDocument();
  });
});
