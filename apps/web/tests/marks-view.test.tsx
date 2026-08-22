// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MarksView } from "../src/components/marks/MarksView";

const classes = [{ id: 1, gradeName: "Grade 5", section: "A" }];

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

  it("blocks submission when a score exceeds the exam maximum", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/marks?")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              subjects: [{ id: 1, name: "Math" }],
              students: [{ studentId: 1, name: "Aadhya Reddy", marks: {} }],
            }),
            { status: 200 }
          )
        );
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const exams = [
      { id: 1, name: "Mid Term", term: "Term 1", examDate: "2026-08-15", published: false, maxMarks: 50 },
    ];
    const teacherSubjects = [{ classId: 1, subjectId: 1, subjectName: "Math" }];

    render(<MarksView exams={exams} classes={classes} teacherSubjects={teacherSubjects} role="teacher" />);

    // Wait for the marks entry section to appear
    await waitFor(() => {
      expect(screen.getByText("Enter Marks")).toBeInTheDocument();
    });

    const markInput = screen.getByLabelText("Marks for Aadhya Reddy");
    await userEvent.type(markInput, "80");
    await userEvent.click(screen.getByRole("button", { name: "Save Marks" }));

    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: "POST" })
    );
    expect(screen.getByText(/cannot exceed 50/i)).toBeInTheDocument();
  });

  it("allows a score equal to the maximum", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/marks?")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              subjects: [{ id: 1, name: "Math" }],
              students: [{ studentId: 1, name: "Aadhya Reddy", marks: {} }],
            }),
            { status: 200 }
          )
        );
      }
      if (url.startsWith("/api/marks") && url.includes("POST")) {
        return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const exams = [
      { id: 1, name: "Mid Term", term: "Term 1", examDate: "2026-08-15", published: false, maxMarks: 50 },
    ];
    const teacherSubjects = [{ classId: 1, subjectId: 1, subjectName: "Math" }];

    render(<MarksView exams={exams} classes={classes} teacherSubjects={teacherSubjects} role="teacher" />);

    // Wait for the marks entry section to appear
    await waitFor(() => {
      expect(screen.getByText("Enter Marks")).toBeInTheDocument();
    });

    const markInput = screen.getByLabelText("Marks for Aadhya Reddy");
    await userEvent.type(markInput, "50");
    await userEvent.click(screen.getByRole("button", { name: "Save Marks" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/marks",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("blocks submission when a score is negative", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/marks?")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              subjects: [{ id: 1, name: "Math" }],
              students: [{ studentId: 1, name: "Aadhya Reddy", marks: {} }],
            }),
            { status: 200 }
          )
        );
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const exams = [
      { id: 1, name: "Mid Term", term: "Term 1", examDate: "2026-08-15", published: false, maxMarks: 50 },
    ];
    const teacherSubjects = [{ classId: 1, subjectId: 1, subjectName: "Math" }];

    render(<MarksView exams={exams} classes={classes} teacherSubjects={teacherSubjects} role="teacher" />);

    // Wait for the marks entry section to appear
    await waitFor(() => {
      expect(screen.getByText("Enter Marks")).toBeInTheDocument();
    });

    const markInput = screen.getByLabelText("Marks for Aadhya Reddy");
    await userEvent.type(markInput, "-5");
    await userEvent.click(screen.getByRole("button", { name: "Save Marks" }));

    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: "POST" })
    );
    expect(screen.getByText(/cannot be negative/i)).toBeInTheDocument();
  });

  it("preserves an already-recorded isAbsent and remarks when saving marks for a different student", async () => {
    // Regression test: handleSave used to build its request body with only
    // { studentId, marksObtained }, dropping isAbsent/remarks entirely. The
    // API route defaults missing isAbsent to false and missing remarks to
    // null on every entry (both create AND update), so saving marks for one
    // student silently wiped a previously-recorded absence/remark on every
    // OTHER student in the same save. This test asserts the outgoing POST
    // body actually carries forward what was loaded for the untouched,
    // already-absent student.
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/marks?")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              subjects: [{ id: 1, name: "Math" }],
              students: [
                { studentId: 1, name: "Aadhya Reddy", marks: {} },
                {
                  studentId: 2,
                  name: "Absent Student",
                  marks: {
                    1: {
                      marksObtained: 0,
                      maxMarks: 50,
                      grade: "AB",
                      isAbsent: true,
                      remarks: "Sick leave",
                    },
                  },
                },
              ],
            }),
            { status: 200 }
          )
        );
      }
      if (url.startsWith("/api/marks") && init?.method === "POST") {
        return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const exams = [
      { id: 1, name: "Mid Term", term: "Term 1", examDate: "2026-08-15", published: false, maxMarks: 50 },
    ];
    const teacherSubjects = [{ classId: 1, subjectId: 1, subjectName: "Math" }];

    render(<MarksView exams={exams} classes={classes} teacherSubjects={teacherSubjects} role="teacher" />);

    await waitFor(() => {
      expect(screen.getByText("Enter Marks")).toBeInTheDocument();
    });

    // Only touch the un-absent student; the absent student's cell is left alone.
    const markInput = screen.getByLabelText("Marks for Aadhya Reddy");
    await userEvent.type(markInput, "40");
    await userEvent.click(screen.getByRole("button", { name: "Save Marks" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/marks",
        expect.objectContaining({ method: "POST" })
      );
    });

    const postCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST"
    );
    const body = JSON.parse((postCall?.[1] as RequestInit).body as string);
    const absentEntry = body.entries.find((e: { studentId: number }) => e.studentId === 2);

    expect(absentEntry.isAbsent).toBe(true);
    expect(absentEntry.remarks).toBe("Sick leave");
  });
});
