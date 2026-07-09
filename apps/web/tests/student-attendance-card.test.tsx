// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StudentAttendanceCard } from "../src/components/attendance/StudentAttendanceCard";

describe("StudentAttendanceCard", () => {
  afterEach(() => cleanup());

  it("shows initials when no photoUrl is provided", () => {
    render(
      <StudentAttendanceCard name="Asha Verma" rollNumber="12" photoUrl={null} status={null} onClick={() => {}} />
    );
    expect(screen.getByText("AV")).toBeInTheDocument();
  });

  it("renders the photo when photoUrl is provided", () => {
    render(
      <StudentAttendanceCard
        name="Asha Verma"
        rollNumber="12"
        photoUrl="/uploads/students/a.png"
        status="present"
        onClick={() => {}}
      />
    );
    expect(screen.getByRole("img")).toHaveAttribute("src", "/uploads/students/a.png");
  });

  it("shows the roll number when set", () => {
    render(
      <StudentAttendanceCard name="Asha Verma" rollNumber="12" photoUrl={null} status={null} onClick={() => {}} />
    );
    expect(screen.getByText("Roll No. 12")).toBeInTheDocument();
  });

  it("omits the roll number line when rollNumber is null", () => {
    render(
      <StudentAttendanceCard name="Asha Verma" rollNumber={null} photoUrl={null} status={null} onClick={() => {}} />
    );
    expect(screen.queryByText(/Roll No\./)).not.toBeInTheDocument();
  });

  it("calls onClick when the card is clicked", async () => {
    const onClick = vi.fn();
    render(
      <StudentAttendanceCard name="Asha Verma" rollNumber="12" photoUrl={null} status={null} onClick={onClick} />
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("shows the status label matching the current status", () => {
    render(
      <StudentAttendanceCard name="Asha Verma" rollNumber="12" photoUrl={null} status="absent" onClick={() => {}} />
    );
    expect(screen.getByText("Absent")).toBeInTheDocument();
  });

  it("exposes the current status in the accessible name", () => {
    render(
      <StudentAttendanceCard name="Asha Verma" rollNumber="12" photoUrl={null} status="late" onClick={() => {}} />
    );
    expect(screen.getByLabelText("Attendance for Asha Verma, currently Late")).toBeInTheDocument();
  });
});
