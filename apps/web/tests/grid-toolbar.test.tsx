// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GridToolbar } from "../src/components/school-setup/GridToolbar";

const filterOptions = [
  { value: "all", label: "All Years" },
  { value: "1", label: "2026-27" },
];

describe("GridToolbar", () => {
  afterEach(() => cleanup());

  it("calls onSearchChange as the user types", async () => {
    const onSearchChange = vi.fn();
    render(
      <GridToolbar
        searchValue=""
        onSearchChange={onSearchChange}
        searchLabel="Search grades..."
        filterValue="all"
        onFilterChange={vi.fn()}
        filterOptions={filterOptions}
        view="grid"
        onViewChange={vi.fn()}
      />
    );
    await userEvent.type(screen.getByLabelText("Search grades..."), "G");
    expect(onSearchChange).toHaveBeenCalledWith("G");
  });

  it("calls onFilterChange when a different year is selected", async () => {
    const onFilterChange = vi.fn();
    render(
      <GridToolbar
        searchValue=""
        onSearchChange={vi.fn()}
        searchLabel="Search grades..."
        filterValue="all"
        onFilterChange={onFilterChange}
        filterOptions={filterOptions}
        view="grid"
        onViewChange={vi.fn()}
      />
    );
    await userEvent.selectOptions(screen.getByLabelText("Filter by academic year"), "1");
    expect(onFilterChange).toHaveBeenCalledWith("1");
  });

  it("calls onViewChange when the List button is clicked", async () => {
    const onViewChange = vi.fn();
    render(
      <GridToolbar
        searchValue=""
        onSearchChange={vi.fn()}
        searchLabel="Search grades..."
        filterValue="all"
        onFilterChange={vi.fn()}
        filterOptions={filterOptions}
        view="grid"
        onViewChange={onViewChange}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "List view" }));
    expect(onViewChange).toHaveBeenCalledWith("list");
  });

  it("marks the active view button with aria-pressed", () => {
    render(
      <GridToolbar
        searchValue=""
        onSearchChange={vi.fn()}
        searchLabel="Search grades..."
        filterValue="all"
        onFilterChange={vi.fn()}
        filterOptions={filterOptions}
        view="list"
        onViewChange={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Grid view" })).toHaveAttribute("aria-pressed", "false");
  });
});
