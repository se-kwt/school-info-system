// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MonthCalendar } from "../src/components/parent/MonthCalendar";
import type { ParentAttendanceDay } from "../src/lib/parent/overview";

describe("MonthCalendar", () => {
  afterEach(() => cleanup());

  const days: ParentAttendanceDay[] = [
    { date: "2026-08-01", dayOfMonth: 1, weekday: 6, status: "present" },
    { date: "2026-08-02", dayOfMonth: 2, weekday: 0, status: "absent" },
    { date: "2026-08-03", dayOfMonth: 3, weekday: 1, status: "late" },
    { date: "2026-08-04", dayOfMonth: 4, weekday: 2, status: null },
  ];

  it("pads the grid with blank cells so day 1 lands on its weekday", () => {
    render(<MonthCalendar days={days} />);
    expect(screen.getAllByTestId("calendar-blank")).toHaveLength(6);
  });

  it("colors each day cell by its attendance status", () => {
    render(<MonthCalendar days={days} />);
    expect(screen.getByText("1")).toHaveClass("bg-emerald-100");
    expect(screen.getByText("2")).toHaveClass("bg-red-100");
    expect(screen.getByText("3")).toHaveClass("bg-amber-100");
    expect(screen.getByText("4")).toHaveClass("bg-neutral-100");
  });

  it("renders the legend", () => {
    render(<MonthCalendar days={days} />);
    expect(screen.getByText("Present")).toBeInTheDocument();
    expect(screen.getByText("Late")).toBeInTheDocument();
    expect(screen.getByText("Absent")).toBeInTheDocument();
    expect(screen.getByText("No record")).toBeInTheDocument();
  });
});
