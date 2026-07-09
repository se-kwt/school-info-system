// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AttendanceReviewPanel } from "../src/components/attendance/AttendanceReviewPanel";

describe("AttendanceReviewPanel", () => {
  afterEach(() => cleanup());

  const entries = [
    { studentId: 1, name: "Absent Student", rollNumber: "1", photoUrl: null, status: "absent" as const },
    { studentId: 2, name: "Unmarked Student", rollNumber: "2", photoUrl: null, status: null },
  ];

  it("renders one card per entry", () => {
    render(<AttendanceReviewPanel entries={entries} onCycle={() => {}} onBack={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText("Absent Student")).toBeInTheDocument();
    expect(screen.getByText("Unmarked Student")).toBeInTheDocument();
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
