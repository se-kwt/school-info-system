// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AcademicYearsView } from "../src/components/academic-years/AcademicYearsView";

describe("AcademicYearsView", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows an Activate button for an upcoming year and calls the API", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/academic-years") {
        return {
          ok: true,
          json: async () => ({
            academicYears: [
              { id: 1, name: "2026-27", startDate: "2026-04-01", endDate: "2027-03-31", status: "active" },
              { id: 2, name: "2027-28", startDate: "2027-04-01", endDate: "2028-03-31", status: "upcoming" },
            ],
          }),
        };
      }
      return { ok: true, json: async () => ({ success: true }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AcademicYearsView
        initialYears={[
          { id: 1, name: "2026-27", startDate: "2026-04-01", endDate: "2027-03-31", status: "active" },
          { id: 2, name: "2027-28", startDate: "2027-04-01", endDate: "2028-03-31", status: "upcoming" },
        ]}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Activate 2027-28" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/academic-years/2",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ action: "activate" }),
      })
    );
  });

  it("shows no Activate button for the already-active year", () => {
    render(
      <AcademicYearsView
        initialYears={[
          { id: 1, name: "2026-27", startDate: "2026-04-01", endDate: "2027-03-31", status: "active" },
        ]}
      />
    );

    expect(screen.queryByRole("button", { name: "Activate 2026-27" })).toBeNull();
  });

  it("shows the error message from the API when archiving is refused", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      json: async () => ({
        error: "Activate the next year instead — a school must always have one active year",
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AcademicYearsView
        initialYears={[
          { id: 2, name: "2027-28", startDate: "2027-04-01", endDate: "2028-03-31", status: "upcoming" },
        ]}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Archive 2027-28" }));

    expect(
      await screen.findByText("Activate the next year instead — a school must always have one active year")
    ).toBeInTheDocument();
  });

  it("shows no Activate button for an archived year", () => {
    render(
      <AcademicYearsView
        initialYears={[
          { id: 1, name: "2024-25", startDate: "2024-04-01", endDate: "2025-03-31", status: "archived" },
        ]}
      />
    );

    expect(screen.queryByRole("button", { name: "Activate 2024-25" })).toBeNull();
  });
});
