// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SyllabusHistoryView } from "../src/components/school-setup/SyllabusHistoryView";

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 400, json: async () => body } as Response;
}

describe("SyllabusHistoryView", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("uploads a file with a new syllabus version", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).includes("upload")) {
        return Promise.resolve(
          jsonResponse({ url: "https://example.test/f.pdf", name: "syllabus.pdf" })
        );
      }
      if (String(url).includes("syllabus-versions") && init?.method === "POST") {
        return Promise.resolve({ ...jsonResponse({ id: 1 }), status: 201 });
      }
      return Promise.resolve(jsonResponse([]));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SyllabusHistoryView subjectId={1} subjectName="Math" initialVersions={[]} />);

    await userEvent.type(screen.getByLabelText(/title/i), "Version 1");
    await userEvent.type(screen.getByLabelText(/content/i), "Chapters 1-5");
    const file = new File(["pdf bytes"], "syllabus.pdf", { type: "application/pdf" });
    await userEvent.upload(screen.getByLabelText(/attach file/i), file);
    await userEvent.click(screen.getByRole("button", { name: /publish version/i }));

    await waitFor(() => {
      const uploadCall = fetchMock.mock.calls.find(([url]) => String(url).includes("upload"));
      expect(uploadCall).toBeDefined();
    });

    const createCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url).includes("syllabus-versions") && init?.method === "POST"
    );
    expect(createCall).toBeDefined();
    const body = JSON.parse((createCall![1] as RequestInit).body as string);
    expect(body.fileUrl).toBe("https://example.test/f.pdf");
    expect(body.fileName).toBe("syllabus.pdf");
  });

  it("marks the current version with a badge", () => {
    render(
      <SyllabusHistoryView
        subjectId={1}
        subjectName="Math"
        initialVersions={[
          {
            id: 2,
            versionNum: 2,
            title: "V2",
            content: "...",
            isCurrent: true,
            createdAt: "2026-08-01",
            fileUrl: null,
            fileName: null,
            createdByName: "Admin",
          },
          {
            id: 1,
            versionNum: 1,
            title: "V1",
            content: "...",
            isCurrent: false,
            createdAt: "2026-07-01",
            fileUrl: null,
            fileName: null,
            createdByName: "Admin",
          },
        ]}
      />
    );

    const currentRow = screen.getByText("V2").closest("li")!;
    expect(within(currentRow).getByText(/current/i)).toBeInTheDocument();

    const oldRow = screen.getByText("V1").closest("li")!;
    expect(within(oldRow).queryByText(/current/i)).toBeNull();
  });
});
