// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StaffView } from "../src/components/school-setup/StaffView";

const classes = [{ id: 1, gradeId: 10, gradeName: "Grade 5", section: "A" }];
const subjects = [{ id: 1, name: "Math", gradeId: 10 }];

const staff = [
  {
    id: 1,
    name: "Current Admin",
    phone: "+15550000001",
    role: "admin" as const,
    status: "active" as const,
    classAssignment: null,
  },
  {
    id: 2,
    name: "Jane Teacher",
    phone: "+15550001111",
    role: "teacher" as const,
    status: "active" as const,
    classAssignment: { gradeName: "Grade 5", section: "A", subjectName: "Math" },
  },
];

describe("StaffView", () => {
  afterEach(() => cleanup());

  it("renders one card per staff member", () => {
    render(<StaffView initialStaff={staff} classes={classes} subjects={subjects} currentUserId={1} />);
    expect(screen.getByText("Current Admin")).toBeInTheDocument();
    expect(screen.getByText("Jane Teacher")).toBeInTheDocument();
  });

  it("filters the grid by role", async () => {
    render(<StaffView initialStaff={staff} classes={classes} subjects={subjects} currentUserId={1} />);
    await userEvent.selectOptions(screen.getByLabelText("Filter by role"), "teacher");
    expect(screen.queryByText("Current Admin")).not.toBeInTheDocument();
    expect(screen.getByText("Jane Teacher")).toBeInTheDocument();
  });

  it("opens the create modal from Add new staff and posts on Save", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 3, name: "New Person", phone: "+15559997777" }), { status: 201 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(staff), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<StaffView initialStaff={staff} classes={classes} subjects={subjects} currentUserId={1} />);
    await userEvent.click(screen.getByRole("button", { name: "Add new staff" }));
    await userEvent.type(screen.getByLabelText("Name"), "New Person");
    await userEvent.type(screen.getByLabelText("Phone"), "+15559997777");
    await userEvent.selectOptions(screen.getByLabelText("Role"), "accountant");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/staff", expect.objectContaining({ method: "POST" }));
    });
  });

  it("opens an existing card and PATCHes on Save", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(staff), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<StaffView initialStaff={staff} classes={classes} subjects={subjects} currentUserId={1} />);
    await userEvent.click(screen.getByRole("button", { name: /Jane Teacher/ }));
    const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Jane T. Updated");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/staff/2", expect.objectContaining({ method: "PATCH" }));
    });
  });

  it("shows the deactivate fallback when delete is blocked", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "blocked", deletable: false }), { status: 400 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(staff), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<StaffView initialStaff={staff} classes={classes} subjects={subjects} currentUserId={1} />);
    await userEvent.click(screen.getByRole("button", { name: /Jane Teacher/ }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText(/has recorded activity/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Deactivate instead" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        "/api/staff/2/deactivate",
        expect.objectContaining({ method: "PATCH" })
      );
    });
  });

  it("hides Delete on the current user's own card", async () => {
    render(<StaffView initialStaff={staff} classes={classes} subjects={subjects} currentUserId={1} />);
    await userEvent.click(screen.getByRole("button", { name: /Current Admin/ }));
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("sends email and HR fields on create", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 3, name: "New Teacher", phone: "+919876543210" }), { status: 201 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<StaffView initialStaff={[]} classes={classes} subjects={subjects} currentUserId={1} />);

    await userEvent.click(screen.getByRole("button", { name: /add new staff/i }));
    await userEvent.type(screen.getByLabelText(/^name/i), "New Teacher");
    await userEvent.type(screen.getByLabelText(/phone/i), "+919876543210");
    await userEvent.type(screen.getByLabelText(/email/i), "teacher@example.com");
    await userEvent.type(screen.getByLabelText(/qualification/i), "M.Sc., B.Ed.");
    await userEvent.type(screen.getByLabelText(/designation/i), "Senior Teacher");
    await userEvent.type(screen.getByLabelText(/joining date/i), "2020-06-01");
    await userEvent.type(screen.getByLabelText(/salary/i), "45000");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const postCall = fetchMock.mock.calls.find((call) => call[1]?.method === "POST")!;
    const body = JSON.parse(postCall[1].body);
    expect(body.email).toBe("teacher@example.com");
    expect(body.qualification).toBe("M.Sc., B.Ed.");
    expect(body.designation).toBe("Senior Teacher");
    expect(body.joiningDate).toBe("2020-06-01");
    expect(body.salary).toBe(45000);
  });

  it("rejects a malformed email before submitting", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<StaffView initialStaff={[]} classes={classes} subjects={subjects} currentUserId={1} />);
    await userEvent.click(screen.getByRole("button", { name: /add new staff/i }));
    await userEvent.type(screen.getByLabelText(/^name/i), "New Teacher");
    await userEvent.type(screen.getByLabelText(/phone/i), "+919876543210");
    await userEvent.type(screen.getByLabelText(/email/i), "not-an-email");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a negative salary before submitting", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<StaffView initialStaff={[]} classes={classes} subjects={subjects} currentUserId={1} />);
    await userEvent.click(screen.getByRole("button", { name: /add new staff/i }));
    await userEvent.type(screen.getByLabelText(/^name/i), "New Teacher");
    await userEvent.type(screen.getByLabelText(/phone/i), "+919876543210");
    await userEvent.type(screen.getByLabelText(/salary/i), "-100");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
