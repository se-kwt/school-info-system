// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

import { AddClassForm } from "../src/components/school-setup/AddClassForm";

const grades = [{ id: 1, name: "Grade 1" }];
const academicYears = [{ id: 1, name: "2026-27" }];

describe("AddClassForm", () => {
  afterEach(() => {
    cleanup();
    pushMock.mockClear();
  });

  it("rejects a class create with an empty section", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<AddClassForm grades={grades} academicYears={academicYears} />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/section is required/i)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("rejects a non-positive capacity on class create", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<AddClassForm grades={grades} academicYears={academicYears} />);
    await userEvent.type(screen.getByLabelText("Section"), "C");
    await userEvent.type(screen.getByLabelText("Capacity"), "0");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/capacity must be greater than 0/i)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("sends capacity and room, then redirects to the classes list", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ id: 3, gradeId: 1, gradeName: "Grade 1", section: "C", academicYearId: 1, archived: false, capacity: 40, room: "B-204" }),
        { status: 201 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AddClassForm grades={grades} academicYears={academicYears} />);
    await userEvent.type(screen.getByLabelText("Section"), "C");
    await userEvent.type(screen.getByLabelText("Capacity"), "40");
    await userEvent.type(screen.getByLabelText("Room"), "B-204");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(fetchMock).toHaveBeenCalled();
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.capacity).toBe(40);
    expect(body.room).toBe("B-204");
    expect(pushMock).toHaveBeenCalledWith("/dashboard/classes");
    vi.unstubAllGlobals();
  });
});
