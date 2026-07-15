// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssignmentsView } from "../src/components/assignments/AssignmentsView";

const classes = [{ id: 1, gradeId: 1, gradeName: "Grade 5", section: "A" }];
const subjects = [{ id: 1, name: "Math", gradeId: 1 }];

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

describe("AssignmentsView", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ assignments: [] })));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows an error and does not call fetch when required fields are empty", async () => {
    render(<AssignmentsView classes={classes} subjects={subjects} role="teacher" currentUserId={1} />);
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());

    const callsBefore = vi.mocked(fetch).mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "New Assignment" }));

    expect(screen.getByText("Subject, title, and due date are required")).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.length).toBe(callsBefore);
  });

  it("disables the button and shows 'Posting…' while a create request is in flight, then re-enables it", async () => {
    let resolveCreate: (value: Response) => void = () => {};
    const fetchMock = vi.fn().mockImplementation((url: string, init: RequestInit | undefined) => {
      if (url === "/api/assignments" && init?.method === "POST") {
        return new Promise<Response>((resolve) => {
          resolveCreate = resolve;
        });
      }
      return Promise.resolve(jsonResponse({ assignments: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AssignmentsView classes={classes} subjects={subjects} role="teacher" currentUserId={1} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    await userEvent.selectOptions(screen.getByLabelText("Subject"), "Math");
    await userEvent.type(screen.getByLabelText("Title"), "Worksheet 1");
    await userEvent.type(screen.getByLabelText("Due date"), "2026-08-01");

    const button = screen.getByRole("button", { name: "New Assignment" });
    await userEvent.click(button);

    await waitFor(() => expect(screen.getByRole("button", { name: "Posting…" })).toBeDisabled());

    resolveCreate(jsonResponse({ id: 1 }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "New Assignment" })).not.toBeDisabled()
    );
  });

  it("only sends one create request when the button is clicked repeatedly before the request resolves", async () => {
    let resolveCreate: (value: Response) => void = () => {};
    const createCalls: unknown[] = [];
    const fetchMock = vi.fn().mockImplementation((url: string, init: RequestInit | undefined) => {
      if (url === "/api/assignments" && init?.method === "POST") {
        createCalls.push(init.body);
        return new Promise<Response>((resolve) => {
          resolveCreate = resolve;
        });
      }
      return Promise.resolve(jsonResponse({ assignments: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AssignmentsView classes={classes} subjects={subjects} role="teacher" currentUserId={1} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    await userEvent.selectOptions(screen.getByLabelText("Subject"), "Math");
    await userEvent.type(screen.getByLabelText("Title"), "Worksheet 1");
    await userEvent.type(screen.getByLabelText("Due date"), "2026-08-01");

    const button = screen.getByRole("button", { name: "New Assignment" });
    await userEvent.click(button);
    await userEvent.click(button);
    await userEvent.click(button);

    expect(createCalls).toHaveLength(1);
    resolveCreate(jsonResponse({ id: 1 }));
  });
});
