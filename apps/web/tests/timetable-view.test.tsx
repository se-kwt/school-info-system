// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, cleanup, within } from "@testing-library/react";
import { TimetableView } from "../src/components/timetable/TimetableView";

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

describe("TimetableView", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.startsWith("/api/timetable")) {
          return Promise.resolve(jsonResponse({ entries: [] }));
        }
        if (url.includes("/faculty")) {
          return Promise.resolve(jsonResponse([]));
        }
        return Promise.resolve(jsonResponse({}));
      })
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("offers only the selected class's grade's subjects", async () => {
    const classes = [
      { id: 1, gradeId: 10, gradeName: "Grade 10", section: "A" },
      { id: 2, gradeId: 1, gradeName: "Grade 1", section: "A" },
    ];
    const subjects = [
      { id: 100, name: "Advanced Calculus", gradeId: 10 },
      { id: 200, name: "Finger Painting", gradeId: 1 },
    ];
    const periods = [{ id: 1, order: 1, label: "Period 1", isBreak: false }];

    render(
      <TimetableView classes={classes} subjects={subjects} periods={periods} role="admin" />
    );

    const select = await screen.findByLabelText("Subject for Period 1 on Monday");
    const options = within(select).getAllByRole("option").map((o) => o.textContent);

    expect(options).toContain("Advanced Calculus");
    expect(options).not.toContain("Finger Painting");
  });
});
