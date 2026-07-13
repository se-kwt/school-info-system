// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AttendanceView } from "../src/components/attendance/AttendanceView";

const classes = [{ id: 1, name: "Grade 5", section: "A" }];
const roster = [
  { studentId: 1, name: "Asha Verma", rollNumber: "1", photoUrl: null, status: null, note: null, monthPercent: 0 },
  {
    studentId: 2,
    name: "Beena Rao",
    rollNumber: "2",
    photoUrl: null,
    status: "present",
    note: null,
    monthPercent: 100,
  },
];

describe("AttendanceView", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ students: roster }), { status: 200 }))
    );
  });

  afterEach(() => cleanup());

  it("renders one card per student after loading the roster", async () => {
    render(<AttendanceView classes={classes} role="teacher" />);
    await waitFor(() => {
      expect(screen.getByText("Asha Verma")).toBeInTheDocument();
      expect(screen.getByText("Beena Rao")).toBeInTheDocument();
    });
  });

  it("cycles a card's status through null -> present -> absent on repeated clicks", async () => {
    render(<AttendanceView classes={classes} role="teacher" />);
    await waitFor(() => screen.getByText("Asha Verma"));

    const card = screen.getByLabelText("Attendance for Asha Verma, currently Unmarked");
    await userEvent.click(card);
    expect(screen.getByLabelText("Attendance for Asha Verma, currently Present")).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Attendance for Asha Verma, currently Present"));
    expect(screen.getByLabelText("Attendance for Asha Verma, currently Absent")).toBeInTheDocument();
  });

  it("Mark All Present turns every card present", async () => {
    render(<AttendanceView classes={classes} role="teacher" />);
    await waitFor(() => screen.getByText("Asha Verma"));

    await userEvent.click(screen.getByRole("button", { name: "Mark All Present" }));

    expect(screen.getByLabelText("Attendance for Asha Verma, currently Present")).toBeInTheDocument();
    expect(screen.getByLabelText("Attendance for Beena Rao, currently Present")).toBeInTheDocument();
  });

  it("Reset clears every card back to unmarked", async () => {
    render(<AttendanceView classes={classes} role="teacher" />);
    await waitFor(() => screen.getByText("Asha Verma"));

    await userEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(screen.getByLabelText("Attendance for Asha Verma, currently Unmarked")).toBeInTheDocument();
    expect(screen.getByLabelText("Attendance for Beena Rao, currently Unmarked")).toBeInTheDocument();
  });

  it("opens the review panel listing only non-present students", async () => {
    render(<AttendanceView classes={classes} role="teacher" />);
    await waitFor(() => screen.getByText("Asha Verma"));

    await userEvent.click(screen.getByRole("button", { name: "Submit All" }));

    expect(screen.getByText("Review Before Submitting")).toBeInTheDocument();
    expect(screen.getAllByText("Asha Verma")).toHaveLength(2);
    expect(screen.getAllByText("Beena Rao")).toHaveLength(1);
  });

  it("submits all current statuses and shows a success message on Confirm & Submit", async () => {
    render(<AttendanceView classes={classes} role="teacher" />);
    await waitFor(() => screen.getByText("Asha Verma"));

    await userEvent.click(screen.getByRole("button", { name: "Submit All" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm & Submit" }));

    await waitFor(() => {
      expect(screen.getByText("Attendance submitted")).toBeInTheDocument();
    });
  });

  it("renders bulk actions and Submit All for admin on any date", async () => {
    render(<AttendanceView classes={classes} role="admin" />);
    await waitFor(() => screen.getByText("Asha Verma"));

    expect(screen.getByRole("button", { name: "Mark All Present" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit All" })).toBeInTheDocument();
  });

  it("lets admin cycle a card's status", async () => {
    render(<AttendanceView classes={classes} role="admin" />);
    await waitFor(() => screen.getByText("Asha Verma"));

    const card = screen.getByLabelText("Attendance for Asha Verma, currently Unmarked");
    await userEvent.click(card);
    expect(screen.getByLabelText("Attendance for Asha Verma, currently Present")).toBeInTheDocument();
  });

  it("is read-only for a teacher viewing a non-today date", async () => {
    render(<AttendanceView classes={classes} role="teacher" />);
    await waitFor(() => screen.getByText("Asha Verma"));

    const dateInput = screen.getByLabelText("Attendance date");
    await userEvent.clear(dateInput);
    await userEvent.type(dateInput, "2020-01-01");

    expect(screen.queryByRole("button", { name: "Mark All Present" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit All" })).not.toBeInTheDocument();

    const card = screen.getByLabelText("Attendance for Asha Verma, currently Unmarked");
    await userEvent.click(card);
    expect(screen.getByLabelText("Attendance for Asha Verma, currently Unmarked")).toBeInTheDocument();
  });
});
