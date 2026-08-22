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

  it("surfaces a day's note as a tooltip, a marker, and a list entry", () => {
    const daysWithNote: ParentAttendanceDay[] = [
      ...days,
      { date: "2026-08-05", dayOfMonth: 5, weekday: 3, status: "absent", note: "Left early, dentist" },
    ];

    render(<MonthCalendar days={daysWithNote} />);

    const notedCell = screen.getByText("5");
    expect(notedCell).toHaveAttribute("title", "Left early, dentist");
    expect(notedCell).toHaveClass("ring-1", "ring-neutral-400");

    const unnotedCell = screen.getByText("2");
    expect(unnotedCell).not.toHaveAttribute("title");
    expect(unnotedCell).not.toHaveClass("ring-1");

    expect(screen.getByText("2026-08-05")).toBeInTheDocument();
    expect(screen.getByText(/Left early, dentist/)).toBeInTheDocument();
  });
});
