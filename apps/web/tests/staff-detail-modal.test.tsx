// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StaffDetailModal } from "../src/components/school-setup/StaffDetailModal";

const classes = [{ id: 1, gradeId: 10, gradeName: "Grade 5", section: "A" }];
const subjects = [{ id: 1, name: "Science", gradeId: 10 }];

const existingStaff = {
  id: 2,
  name: "Jane Teacher",
  phone: "+15550001111",
  role: "teacher" as const,
  status: "active" as const,
  classAssignment: { gradeName: "Grade 5", section: "A", subjectName: "Math" },
};

function noop() {}

describe("StaffDetailModal", () => {
  afterEach(() => cleanup());

  it("create mode: renders blank fields and calls onSave with assembled fields", async () => {
    const onSave = vi.fn();
    render(
      <StaffDetailModal
        mode="create"
        classes={classes}
        subjects={subjects}
        isSelf={false}
        serverError={null}
        deleteBlocked={false}
        onClose={noop}
        onSave={onSave}
        onDelete={noop}
        onDeactivate={noop}
        onCancelDelete={noop}
        onActivate={noop}
      />
    );

    await userEvent.type(screen.getByLabelText("Name"), "New Teacher");
    await userEvent.type(screen.getByLabelText("Phone"), "+15559998888");
    await userEvent.selectOptions(screen.getByLabelText("Class assignment"), "1");
    await userEvent.selectOptions(screen.getByLabelText("Subject"), "1");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith({
      name: "New Teacher",
      phone: "+15559998888",
      role: "teacher",
      classId: 1,
      subjectId: 1,
      email: "",
      qualification: "",
      designation: "",
      joiningDate: "",
      salary: "",
      address: "",
      photoFile: null,
    });
  });

  it("create mode: role other than teacher hides class/subject fields and sends null classId", async () => {
    const onSave = vi.fn();
    render(
      <StaffDetailModal
        mode="create"
        classes={classes}
        subjects={subjects}
        isSelf={false}
        serverError={null}
        deleteBlocked={false}
        onClose={noop}
        onSave={onSave}
        onDelete={noop}
        onDeactivate={noop}
        onCancelDelete={noop}
        onActivate={noop}
      />
    );

    await userEvent.type(screen.getByLabelText("Name"), "New Admin");
    await userEvent.type(screen.getByLabelText("Phone"), "+15559998888");
    await userEvent.selectOptions(screen.getByLabelText("Role"), "admin");
    expect(screen.queryByLabelText("Class assignment")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith({
      name: "New Admin",
      phone: "+15559998888",
      role: "admin",
      classId: null,
      subjectId: null,
      email: "",
      qualification: "",
      designation: "",
      joiningDate: "",
      salary: "",
      address: "",
      photoFile: null,
    });
  });

  it("edit mode: pre-fills fields from the staff prop", () => {
    render(
      <StaffDetailModal
        mode="edit"
        staff={existingStaff}
        classes={classes}
        subjects={subjects}
        isSelf={false}
        serverError={null}
        deleteBlocked={false}
        onClose={noop}
        onSave={noop}
        onDelete={noop}
        onDeactivate={noop}
        onCancelDelete={noop}
        onActivate={noop}
      />
    );

    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Jane Teacher");
    expect((screen.getByLabelText("Phone") as HTMLInputElement).value).toBe("+15550001111");
  });

  it("edit mode: renders the staff member's joining date in a human-readable format", () => {
    render(
      <StaffDetailModal
        mode="edit"
        staff={{ ...existingStaff, joiningDate: "2024-06-15" }}
        classes={classes}
        subjects={subjects}
        isSelf={false}
        serverError={null}
        deleteBlocked={false}
        onClose={noop}
        onSave={noop}
        onDelete={noop}
        onDeactivate={noop}
        onCancelDelete={noop}
        onActivate={noop}
      />
    );

    expect(screen.getByText("Joining date: 15 Jun 2024")).toBeInTheDocument();
  });

  it("edit mode: hides Delete when isSelf is true", () => {
    render(
      <StaffDetailModal
        mode="edit"
        staff={existingStaff}
        classes={classes}
        subjects={subjects}
        isSelf={true}
        serverError={null}
        deleteBlocked={false}
        onClose={noop}
        onSave={noop}
        onDelete={noop}
        onDeactivate={noop}
        onCancelDelete={noop}
        onActivate={noop}
      />
    );
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("edit mode: hides Deactivate when isSelf is true", () => {
    render(
      <StaffDetailModal
        mode="edit"
        staff={existingStaff}
        classes={classes}
        subjects={subjects}
        isSelf={true}
        serverError={null}
        deleteBlocked={false}
        onClose={noop}
        onSave={noop}
        onDelete={noop}
        onDeactivate={noop}
        onCancelDelete={noop}
        onActivate={noop}
      />
    );
    expect(screen.queryByRole("button", { name: "Deactivate" })).not.toBeInTheDocument();
  });

  it("edit mode: clicking Delete calls onDelete", async () => {
    const onDelete = vi.fn();
    render(
      <StaffDetailModal
        mode="edit"
        staff={existingStaff}
        classes={classes}
        subjects={subjects}
        isSelf={false}
        serverError={null}
        deleteBlocked={false}
        onClose={noop}
        onSave={noop}
        onDelete={onDelete}
        onDeactivate={noop}
        onCancelDelete={noop}
        onActivate={noop}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("edit mode: when deleteBlocked, shows the explanatory banner and Cancel, with exactly one Deactivate button", async () => {
    const onDeactivate = vi.fn();
    const onCancelDelete = vi.fn();
    render(
      <StaffDetailModal
        mode="edit"
        staff={existingStaff}
        classes={classes}
        subjects={subjects}
        isSelf={false}
        serverError={null}
        deleteBlocked={true}
        onClose={noop}
        onSave={noop}
        onDelete={noop}
        onDeactivate={onDeactivate}
        onCancelDelete={onCancelDelete}
        onActivate={noop}
      />
    );
    expect(screen.getByText(/has recorded activity/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deactivate instead" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Deactivate" })).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    expect(onDeactivate).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancelDelete).toHaveBeenCalledTimes(1);
  });

  it("edit mode: shows Activate button for an inactive staff member and calls onActivate", async () => {
    const onActivate = vi.fn();
    render(
      <StaffDetailModal
        mode="edit"
        staff={{ ...existingStaff, status: "inactive" }}
        classes={classes}
        subjects={subjects}
        isSelf={false}
        serverError={null}
        deleteBlocked={false}
        onClose={noop}
        onSave={noop}
        onDelete={noop}
        onDeactivate={noop}
        onCancelDelete={noop}
        onActivate={onActivate}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Activate" }));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("renders a server error message when provided", () => {
    render(
      <StaffDetailModal
        mode="create"
        classes={classes}
        subjects={subjects}
        isSelf={false}
        serverError="This phone number is already registered"
        deleteBlocked={false}
        onClose={noop}
        onSave={noop}
        onDelete={noop}
        onDeactivate={noop}
        onCancelDelete={noop}
        onActivate={noop}
      />
    );
    expect(screen.getByText("This phone number is already registered")).toBeInTheDocument();
  });

  it("variant page: renders fields without the modal dialog wrapper", () => {
    render(
      <StaffDetailModal
        mode="create"
        variant="page"
        classes={classes}
        subjects={subjects}
        isSelf={false}
        serverError={null}
        deleteBlocked={false}
        onClose={noop}
        onSave={noop}
        onDelete={noop}
        onDeactivate={noop}
        onCancelDelete={noop}
        onActivate={noop}
      />
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
  });
});
