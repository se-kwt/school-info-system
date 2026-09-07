// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

import { AddStaffPage } from "../src/components/school-setup/AddStaffPage";

const classes = [{ id: 1, gradeId: 10, gradeName: "Grade 5", section: "A" }];
const subjects = [{ id: 1, name: "Math", gradeId: 10 }];

describe("AddStaffPage", () => {
  afterEach(() => {
    cleanup();
    pushMock.mockClear();
  });

  it("posts new staff and redirects to the staff list on success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 3, name: "New Person", phone: "+15559997777" }), { status: 201 })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<AddStaffPage classes={classes} subjects={subjects} />);
    await userEvent.type(screen.getByLabelText("Name"), "New Person");
    await userEvent.type(screen.getByLabelText("Phone"), "+15559997777");
    await userEvent.selectOptions(screen.getByLabelText("Role"), "accountant");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/staff", expect.objectContaining({ method: "POST" }));
    });
    expect(pushMock).toHaveBeenCalledWith("/dashboard/staff");
  });

  it("sends email and HR fields on create", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 3, name: "New Teacher", phone: "+919876543210" }), { status: 201 })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<AddStaffPage classes={classes} subjects={subjects} />);
    await userEvent.type(screen.getByLabelText(/^name/i), "New Teacher");
    await userEvent.type(screen.getByLabelText(/phone/i), "+919876543210");
    await userEvent.type(screen.getByLabelText(/email/i), "teacher@example.com");
    await userEvent.type(screen.getByLabelText(/qualification/i), "M.Sc., B.Ed.");
    await userEvent.type(screen.getByLabelText(/designation/i), "Senior Teacher");
    await userEvent.type(screen.getByLabelText(/joining date/i), "2020-06-01");
    await userEvent.type(screen.getByLabelText(/salary/i), "45000");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.email).toBe("teacher@example.com");
    expect(body.qualification).toBe("M.Sc., B.Ed.");
    expect(body.designation).toBe("Senior Teacher");
    expect(body.joiningDate).toBe("2020-06-01");
    expect(body.salary).toBe(45000);
  });

  it("rejects a malformed email before submitting", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<AddStaffPage classes={classes} subjects={subjects} />);
    await userEvent.type(screen.getByLabelText(/^name/i), "New Teacher");
    await userEvent.type(screen.getByLabelText(/phone/i), "+919876543210");
    await userEvent.type(screen.getByLabelText(/email/i), "not-an-email");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a negative salary before submitting", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<AddStaffPage classes={classes} subjects={subjects} />);
    await userEvent.type(screen.getByLabelText(/^name/i), "New Teacher");
    await userEvent.type(screen.getByLabelText(/phone/i), "+919876543210");
    await userEvent.type(screen.getByLabelText(/salary/i), "-100");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
