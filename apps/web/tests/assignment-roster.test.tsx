// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssignmentRoster } from "../src/components/assignments/AssignmentRoster";

const assignment = {
  id: 1,
  subject: "Math",
  title: "Worksheet 1",
  description: null,
  dueDate: "2026-08-01",
  createdById: 1,
  attachmentUrl: null,
  attachmentName: null,
};

const statuses = [{ studentId: 1, name: "Rohan Sharma", status: "pending" as const }];

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

function noop() {}

describe("AssignmentRoster edit form", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ statuses })));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  async function openEditForm() {
    render(
      <AssignmentRoster assignment={assignment} role="teacher" currentUserId={1} onChanged={noop} />
    );
    await waitFor(() => screen.getByText("Rohan Sharma"));
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
  }

  it("shows an error and does not call fetch when required fields are cleared", async () => {
    await openEditForm();

    const fetchCallsBefore = vi.mocked(fetch).mock.calls.length;
    await userEvent.clear(screen.getByLabelText("Edit title"));
    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(screen.getByText("Subject, title, and due date are required")).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.length).toBe(fetchCallsBefore);
  });

  it("disables Save Changes while a save is in flight, then re-enables it", async () => {
    let resolvePatch: (value: Response) => void = () => {};
    const fetchMock = vi.fn().mockImplementation((url: string, init: RequestInit | undefined) => {
      if (url === `/api/assignments/${assignment.id}` && init?.method === "PATCH") {
        return new Promise<Response>((resolve) => {
          resolvePatch = resolve;
        });
      }
      return Promise.resolve(jsonResponse({ statuses }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AssignmentRoster assignment={assignment} role="teacher" currentUserId={1} onChanged={noop} />
    );
    await waitFor(() => screen.getByText("Rohan Sharma"));
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));

    const button = screen.getByRole("button", { name: "Save Changes" });
    await userEvent.click(button);

    await waitFor(() => expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled());

    resolvePatch(jsonResponse({ success: true }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Saving…" })).not.toBeInTheDocument()
    );
  });

  it("only sends one PATCH request when Save Changes is clicked repeatedly before it resolves", async () => {
    let resolvePatch: (value: Response) => void = () => {};
    const patchCalls: unknown[] = [];
    const fetchMock = vi.fn().mockImplementation((url: string, init: RequestInit | undefined) => {
      if (url === `/api/assignments/${assignment.id}` && init?.method === "PATCH") {
        patchCalls.push(init.body);
        return new Promise<Response>((resolve) => {
          resolvePatch = resolve;
        });
      }
      return Promise.resolve(jsonResponse({ statuses }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AssignmentRoster assignment={assignment} role="teacher" currentUserId={1} onChanged={noop} />
    );
    await waitFor(() => screen.getByText("Rohan Sharma"));
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));

    const button = screen.getByRole("button", { name: "Save Changes" });
    await userEvent.click(button);
    await userEvent.click(button);
    await userEvent.click(button);

    expect(patchCalls).toHaveLength(1);
    resolvePatch(jsonResponse({ success: true }));
  });
});
