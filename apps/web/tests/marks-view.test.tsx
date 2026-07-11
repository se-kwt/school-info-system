// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MarksView } from "../src/components/marks/MarksView";

const classes = [{ id: 1, name: "Grade 5", section: "A" }];

function mockExamCreationFlow() {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url.startsWith("/api/exams") && method === "POST") {
      return Promise.resolve(new Response(JSON.stringify({ id: 1 }), { status: 200 }));
    }
    if (url.startsWith("/api/exams")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ exams: [{ id: 1, name: "Mid Term", term: "Term 1", examDate: "2026-08-15" }] }),
          { status: 200 }
        )
      );
    }
    if (url.startsWith("/api/marks")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ subjects: [], students: [{ studentId: 1, name: "Aadhya Reddy", marks: {} }] }),
          { status: 200 }
        )
      );
    }
    return Promise.resolve(new Response("{}", { status: 200 }));
  });
}

describe("MarksView", () => {
  afterEach(() => cleanup());

  it("selects and loads the newly created exam's roster without a manual reselect", async () => {
    vi.stubGlobal("fetch", mockExamCreationFlow());

    render(<MarksView exams={[]} classes={classes} teacherSubjects={[]} role="admin" />);

    await userEvent.type(screen.getByLabelText("New exam name"), "Mid Term");
    await userEvent.type(screen.getByLabelText("New exam term"), "Term 1");
    await userEvent.type(screen.getByLabelText("New exam date"), "2026-08-15");
    await userEvent.click(screen.getByRole("button", { name: "New Exam" }));

    await waitFor(() => {
      expect(screen.getByText("Aadhya Reddy")).toBeInTheDocument();
    });

    expect(screen.getByLabelText("Exam")).toHaveValue("1");
  });
});
