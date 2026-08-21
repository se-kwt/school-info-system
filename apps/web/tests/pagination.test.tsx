// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pagination } from "../src/components/school-setup/Pagination";

describe("Pagination", () => {
  afterEach(() => cleanup());

  it("shows the current range and total", () => {
    render(<Pagination page={1} pageSize={8} total={11} onPageChange={vi.fn()} itemLabel="grades" />);
    expect(screen.getByText("Showing 1 to 8 of 11 grades")).toBeInTheDocument();
  });

  it("disables the previous button on the first page", () => {
    render(<Pagination page={1} pageSize={8} total={11} onPageChange={vi.fn()} itemLabel="grades" />);
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).not.toBeDisabled();
  });

  it("disables the next button on the last page", () => {
    render(<Pagination page={2} pageSize={8} total={11} onPageChange={vi.fn()} itemLabel="grades" />);
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous page" })).not.toBeDisabled();
  });

  it("calls onPageChange with the next page number", async () => {
    const onPageChange = vi.fn();
    render(<Pagination page={1} pageSize={8} total={11} onPageChange={onPageChange} itemLabel="grades" />);
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
