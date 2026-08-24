// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AttendanceReviewPanel } from "../src/components/attendance/AttendanceReviewPanel";

describe("AttendanceReviewPanel", () => {
  afterEach(() => cleanup());

  const entries = [
    { studentId: 1, name: "Absent Student", rollNumber: "1", photoUrl: null, status: "absent" as const },
    { studentId: 2, name: "Unmarked Student", rollNumber: null, photoUrl: null, status: null },
  ];

  it("renders one card per entry", () => {
    render(<AttendanceReviewPanel entries={entries} onCycle={() => {}} onBack={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText("Absent Student")).toBeInTheDocument();
    expect(screen.getByText("Unmarked Student")).toBeInTheDocument();
  });

  it("exposes itself as a labelled, modal dialog", () => {
    render(<AttendanceReviewPanel entries={entries} onCycle={() => {}} onBack={() => {}} onConfirm={() => {}} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Review Before Submitting");
  });

  it("calls onBack when Escape is pressed", () => {
    const onBack = vi.fn();
    render(<AttendanceReviewPanel entries={entries} onCycle={() => {}} onBack={onBack} onConfirm={() => {}} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("shows an all-clear message when entries is empty", () => {
    render(<AttendanceReviewPanel entries={[]} onCycle={() => {}} onBack={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText("Every student is marked present.")).toBeInTheDocument();
  });

  it("calls onCycle with the clicked student's id", async () => {
    const onCycle = vi.fn();
    render(<AttendanceReviewPanel entries={entries} onCycle={onCycle} onBack={() => {}} onConfirm={() => {}} />);
    await userEvent.click(screen.getByText("Absent Student"));
    expect(onCycle).toHaveBeenCalledWith(1);
  });

  it("calls onConfirm when Confirm & Submit is clicked", async () => {
    const onConfirm = vi.fn();
    render(<AttendanceReviewPanel entries={entries} onCycle={() => {}} onBack={() => {}} onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: "Confirm & Submit" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onBack when Back is clicked", async () => {
    const onBack = vi.fn();
    render(<AttendanceReviewPanel entries={entries} onCycle={() => {}} onBack={onBack} onConfirm={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
