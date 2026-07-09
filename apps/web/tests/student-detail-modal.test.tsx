// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StudentDetailModal } from "../src/components/school-setup/StudentDetailModal";

const classes = [
  { id: 1, name: "Grade 5", section: "A" },
  { id: 2, name: "Grade 6", section: "B" },
];

const existingStudent = {
  id: 1,
  name: "Rohan Sharma",
  admissionNo: "SCH-1",
  rollNumber: "5",
  photoUrl: null,
  status: "active" as const,
  class: { name: "Grade 5", section: "A" },
  parents: [],
};

function noop() {}

describe("StudentDetailModal", () => {
  afterEach(() => cleanup());

  it("create mode: renders all create fields and assembles fields on Save", async () => {
    const onSave = vi.fn();
    render(
      <StudentDetailModal
        mode="create"
        classes={classes}
        isAdmin={true}
        defaultClassId={2}
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

    await userEvent.type(screen.getByLabelText("Name"), "New Student");
    await userEvent.type(screen.getByLabelText("Date of birth"), "2016-01-01");
    await userEvent.type(screen.getByLabelText("Admission number"), "SCH-2");
    await userEvent.type(screen.getByLabelText("Roll number"), "9");
    await userEvent.type(screen.getByLabelText("Parent phone"), "+15550009999");
    await userEvent.type(screen.getByLabelText("Parent name"), "A Parent");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith({
      name: "New Student",
      dob: "2016-01-01",
      admissionNo: "SCH-2",
      rollNumber: "9",
      classId: 2,
      photoFile: null,
      parentPhone: "+15550009999",
      parentName: "A Parent",
    });
  });

  it("create mode: uploading a photo includes it as photoFile on Save", async () => {
    const onSave = vi.fn();
    render(
      <StudentDetailModal
        mode="create"
        classes={classes}
        isAdmin={true}
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

    const file = new File(["binary"], "photo.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Photo"), file);
    await userEvent.type(screen.getByLabelText("Name"), "New Student");
    await userEvent.type(screen.getByLabelText("Admission number"), "SCH-2");
    await userEvent.type(screen.getByLabelText("Parent phone"), "+15550009999");
    await userEvent.type(screen.getByLabelText("Parent name"), "A Parent");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave.mock.calls[0][0].photoFile).toBe(file);
  });

  it("edit mode: pre-fills fields and hides parent fields", () => {
    render(
      <StudentDetailModal
        mode="edit"
        student={existingStudent}
        classes={classes}
        isAdmin={true}
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
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Rohan Sharma");
    expect((screen.getByLabelText("Admission number") as HTMLInputElement).value).toBe("SCH-1");
    expect(screen.queryByLabelText("Parent phone")).not.toBeInTheDocument();
  });

  it("edit mode: hides the class dropdown when the student has no active enrollment", () => {
    render(
      <StudentDetailModal
        mode="edit"
        student={{ ...existingStudent, class: null }}
        classes={classes}
        isAdmin={true}
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
    expect(screen.queryByLabelText("Class")).not.toBeInTheDocument();
  });

  it("non-admin: hides Save and Delete", () => {
    render(
      <StudentDetailModal
        mode="edit"
        student={existingStudent}
        classes={classes}
        isAdmin={false}
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
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("edit mode: deleteBlocked shows Deactivate instead and Cancel", async () => {
    const onDeactivate = vi.fn();
    const onCancelDelete = vi.fn();
    render(
      <StudentDetailModal
        mode="edit"
        student={existingStudent}
        classes={classes}
        isAdmin={true}
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
    await userEvent.click(screen.getByRole("button", { name: "Deactivate instead" }));
    expect(onDeactivate).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancelDelete).toHaveBeenCalledTimes(1);
  });

  it("edit mode: shows Activate for a non-active student and calls onActivate", async () => {
    const onActivate = vi.fn();
    render(
      <StudentDetailModal
        mode="edit"
        student={{ ...existingStudent, status: "inactive" }}
        classes={classes}
        isAdmin={true}
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
});
