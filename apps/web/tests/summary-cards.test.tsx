// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  AttendanceCard,
  AssignmentsCard,
  MarksCard,
  FeesCard,
} from "../src/components/parent/SummaryCards";

describe("AttendanceCard", () => {
  afterEach(() => cleanup());

  it("shows the attendance percent", () => {
    render(<AttendanceCard percent={82} />);
    expect(screen.getByText("82%")).toBeInTheDocument();
  });
});

describe("AssignmentsCard", () => {
  afterEach(() => cleanup());

  it("shows a message when there are no pending assignments", () => {
    render(<AssignmentsCard assignments={[]} />);
    expect(screen.getByText("No pending assignments")).toBeInTheDocument();
  });

  it("lists each assignment with subject, title, and due date", () => {
    render(
      <AssignmentsCard
        assignments={[
          { id: 1, subject: "Mathematics", title: "Worksheet 3", dueDate: "2026-08-01", status: "pending" },
          { id: 2, subject: "Science", title: "Lab Report", dueDate: "2026-07-05", status: "overdue" },
        ]}
      />
    );
    expect(screen.getByText("Worksheet 3")).toBeInTheDocument();
    expect(screen.getByText("Lab Report")).toBeInTheDocument();
    expect(screen.getByText("2026-07-05 · overdue")).toBeInTheDocument();
  });
});

describe("MarksCard", () => {
  afterEach(() => cleanup());

  it("shows a message when there is no exam yet", () => {
    render(<MarksCard latestExam={null} />);
    expect(screen.getByText("No exams recorded yet")).toBeInTheDocument();
  });

  it("shows the latest exam's subject breakdown", () => {
    render(
      <MarksCard
        latestExam={{
          examName: "Final Term",
          term: "Term 2",
          subjects: [{ subject: "Mathematics", marksObtained: 91, maxMarks: 100, grade: "A" }],
        }}
      />
    );
    expect(screen.getByText("Final Term")).toBeInTheDocument();
    expect(screen.getByText("Mathematics: 91/100 (A)")).toBeInTheDocument();
  });
});

describe("FeesCard", () => {
  afterEach(() => cleanup());

  it("shows 'No dues' when the outstanding amount is zero", () => {
    render(<FeesCard fees={{ amount: 0, nearestDueDate: null }} />);
    expect(screen.getByText("No dues")).toBeInTheDocument();
  });

  it("shows the outstanding amount and nearest due date", () => {
    render(<FeesCard fees={{ amount: 3000, nearestDueDate: "2026-09-01" }} />);
    expect(screen.getByText("₹3000")).toBeInTheDocument();
    expect(screen.getByText("Due 2026-09-01")).toBeInTheDocument();
  });
});
