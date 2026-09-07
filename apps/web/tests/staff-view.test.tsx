// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, within, cleanup } from "@testing-library/react";
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

  it("links Add new staff to the dedicated Add Staff page", () => {
    render(<StaffView initialStaff={staff} classes={classes} subjects={subjects} currentUserId={1} />);
    expect(screen.getByRole("link", { name: "Add new staff" })).toHaveAttribute("href", "/dashboard/staff/add");
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
    await userEvent.click(screen.getByRole("button", { name: "Deactivate" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        "/api/staff/2/deactivate",
        expect.objectContaining({ method: "PATCH" })
      );
    });
  });

  it("shows exactly one Deactivate button after a blocked delete, not a duplicate", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "blocked", deletable: false }), { status: 400 })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<StaffView initialStaff={staff} classes={classes} subjects={subjects} currentUserId={1} />);
    await userEvent.click(screen.getByRole("button", { name: /Jane Teacher/ }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText(/has recorded activity/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deactivate instead" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Deactivate" })).toHaveLength(1);
  });

  it("hides Delete on the current user's own card", async () => {
    render(<StaffView initialStaff={staff} classes={classes} subjects={subjects} currentUserId={1} />);
    await userEvent.click(screen.getByRole("button", { name: /Current Admin/ }));
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("offers Deactivate without a failed delete first", async () => {
    render(<StaffView initialStaff={staff} classes={classes} subjects={subjects} currentUserId={1} />);
    await userEvent.click(screen.getByRole("button", { name: /Jane Teacher/ }));

    expect(screen.getByRole("button", { name: "Deactivate" })).toBeInTheDocument();
  });

  it("offers Activate instead for an inactive staff member", async () => {
    const inactiveStaff = [{ ...staff[1], id: 9, name: "Former Staffer", status: "inactive" as const }];
    render(<StaffView initialStaff={inactiveStaff} classes={classes} subjects={subjects} currentUserId={1} />);
    await userEvent.click(screen.getByRole("button", { name: /Former Staffer/ }));

    expect(screen.getByRole("button", { name: "Activate" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deactivate" })).toBeNull();
  });

  it("filters the staff list by search term", async () => {
    const searchStaff = [
      { ...staff[0], id: 1, name: "Anita Menon", phone: "+15550001111" },
      { ...staff[1], id: 2, name: "Bhavesh Kumar", phone: "+15550007777" },
    ];
    render(<StaffView initialStaff={searchStaff} classes={classes} subjects={subjects} currentUserId={1} />);

    await userEvent.type(screen.getByLabelText(/search/i), "anita");

    expect(screen.getByText("Anita Menon")).toBeInTheDocument();
    expect(screen.queryByText("Bhavesh Kumar")).toBeNull();
  });

  it("searches phone as well as name", async () => {
    const searchStaff = [
      { ...staff[0], id: 1, name: "Anita Menon", phone: "+15550001111" },
      { ...staff[1], id: 2, name: "Bhavesh Kumar", phone: "+15550007777" },
    ];
    render(<StaffView initialStaff={searchStaff} classes={classes} subjects={subjects} currentUserId={1} />);

    await userEvent.type(screen.getByLabelText(/search/i), "7777");

    expect(screen.getByText("Bhavesh Kumar")).toBeInTheDocument();
    expect(screen.queryByText("Anita Menon")).toBeNull();
  });

  it("paginates a long list", async () => {
    const many = Array.from({ length: 45 }, (_, i) => ({
      ...staff[0],
      id: i + 1,
      name: `Staff ${i + 1}`,
      phone: `+1555000${String(i + 1).padStart(4, "0")}`,
    }));

    render(<StaffView initialStaff={many} classes={classes} subjects={subjects} currentUserId={1} />);

    expect(screen.queryByText("Staff 9")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByText("Staff 9")).toBeInTheDocument();
  });

  it("returns to the first page when the search changes", async () => {
    const many = Array.from({ length: 45 }, (_, i) => ({
      ...staff[0],
      id: i + 1,
      name: `Staff ${i + 1}`,
      phone: `+1555000${String(i + 1).padStart(4, "0")}`,
    }));

    render(<StaffView initialStaff={many} classes={classes} subjects={subjects} currentUserId={1} />);

    await userEvent.click(screen.getByRole("button", { name: /next/i }));
    await userEvent.type(screen.getByLabelText(/search/i), "Staff 1");

    expect(screen.getByText("Staff 1")).toBeInTheDocument();
  });

  it("switches to a real list-table view when List is clicked", async () => {
    render(<StaffView initialStaff={staff} classes={classes} subjects={subjects} currentUserId={1} />);

    expect(screen.queryByRole("table")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /list view/i }));

    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();
    expect(within(table).getByText("Current Admin")).toBeInTheDocument();
    expect(within(table).getByText("Jane Teacher")).toBeInTheDocument();
    expect(within(table).getByText("+15550001111")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /grid view/i }));
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("Current Admin")).toBeInTheDocument();
  });
});
