// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ExamBreakdown } from "../src/components/parent/ExamBreakdown";

describe("ExamBreakdown", () => {
  afterEach(() => cleanup());

  it("shows the exam name and each subject's marks/grade", () => {
    render(
      <ExamBreakdown
        examName="Final Term"
        subjects={[{ subject: "Mathematics", marksObtained: 91, maxMarks: 100, grade: "A" }]}
      />
    );
    expect(screen.getByText("Final Term")).toBeInTheDocument();
    expect(screen.getByText("Mathematics: 91/100 (A)")).toBeInTheDocument();
  });
});
