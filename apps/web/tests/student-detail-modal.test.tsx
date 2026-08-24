// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StudentDetailModal } from "../src/components/school-setup/StudentDetailModal";

const classes = [
  { id: 1, gradeName: "Grade 5", section: "A" },
  { id: 2, gradeName: "Grade 6", section: "B" },
];

const existingStudent = {
  id: 1,
  name: "Rohan Sharma",
  dob: "2010-01-01",
  admissionNo: "SCH-1",
  rollNumber: "5",
  photoUrl: null,
  status: "active" as const,
  gender: "male" as const,
  studentIdNumber: "STU-1",
  dateOfJoin: "2026-06-01",
  classId: 1,
  class: { gradeName: "Grade 5", section: "A" },
  parents: [],
  siblings: [],
};

const allStudents = [
  { id: 2, name: "Priya Sharma", admissionNo: "SCH-9", gender: "female" as const, class: { gradeName: "Grade 5", section: "A" } },
  { id: 3, name: "Amit Rao", admissionNo: "SCH-10", gender: "male" as const, class: { gradeName: "Grade 6", section: "B" } },
];

function noop() {}

describe("StudentDetailModal", () => {
  afterEach(() => cleanup());

  it("create mode: renders all create fields and assembles fields on Save", async () => {
    const onSave = vi.fn();
    render(
      <StudentDetailModal
        mode="create"
        classes={classes}
        allStudents={allStudents}
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

    await userEvent.type(screen.getByLabelText("First name"), "New");
    await userEvent.type(screen.getByLabelText("Last name"), "Student");
    await userEvent.type(screen.getByLabelText("Date of birth"), "2016-01-01");
    await userEvent.type(screen.getByLabelText("Admission number"), "SCH-2");
    await userEvent.type(screen.getByLabelText("Roll number"), "9");
    await userEvent.click(screen.getByRole("button", { name: "Add parent" }));
    await userEvent.selectOptions(screen.getByLabelText("Parent 1 relationship"), "Mother");
    await userEvent.type(screen.getByLabelText("Parent 1 first name"), "A");
    await userEvent.type(screen.getByLabelText("Parent 1 last name"), "Parent");
    await userEvent.type(screen.getByLabelText("Parent 1 mobile number"), "+15550009999");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "New Student",
        dob: "2016-01-01",
        admissionNo: "SCH-2",
        rollNumber: "9",
        classId: 2,
        photoFile: null,
        parents: [
          { relationship: "mother", firstName: "A", lastName: "Parent", phone: "+15550009999", email: "" },
        ],
      })
    );
  });

  it("create mode: uploading a photo includes it as photoFile on Save", async () => {
    const onSave = vi.fn();
    render(
      <StudentDetailModal
        mode="create"
        classes={classes}
        allStudents={allStudents}
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
    await userEvent.type(screen.getByLabelText("First name"), "New");
    await userEvent.type(screen.getByLabelText("Admission number"), "SCH-2");
    await userEvent.click(screen.getByRole("button", { name: "Add parent" }));
    await userEvent.type(screen.getByLabelText("Parent 1 first name"), "A");
    await userEvent.type(screen.getByLabelText("Parent 1 last name"), "Parent");
    await userEvent.type(screen.getByLabelText("Parent 1 mobile number"), "+15550009999");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave.mock.calls[0][0].photoFile).toBe(file);
  });

  it("edit mode: pre-fills fields and shows existing parent rows", () => {
    render(
      <StudentDetailModal
        mode="edit"
        student={{
          ...existingStudent,
          parents: [{ relationship: "father", name: "Suresh Sharma", phone: "+15551234567", email: null }],
        }}
        classes={classes}
        allStudents={allStudents}
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
    expect((screen.getByRole("textbox", { name: "First name" }) as HTMLInputElement).value).toBe("Rohan");
    expect((screen.getByRole("textbox", { name: "Last name" }) as HTMLInputElement).value).toBe("Sharma");
    expect((screen.getByLabelText("Parent 1 first name") as HTMLInputElement).value).toBe("Suresh");
    expect((screen.getByLabelText("Parent 1 last name") as HTMLInputElement).value).toBe("Sharma");
    expect((screen.getByLabelText("Parent 1 mobile number") as HTMLInputElement).value).toBe("+15551234567");
  });

  it("edit mode: pre-fills gender, studentIdNumber, and dateOfJoin, and shows status read-only", () => {
    render(
      <StudentDetailModal
        mode="edit"
        student={existingStudent}
        classes={classes}
        allStudents={allStudents}
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
    expect((screen.getByLabelText("Gender") as HTMLSelectElement).value).toBe("male");
    expect((screen.getByLabelText("ID") as HTMLInputElement).value).toBe("STU-1");
    expect((screen.getByLabelText("Date of join") as HTMLInputElement).value).toBe("2026-06-01");
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.queryByLabelText("Status")).not.toBeInTheDocument();
  });

  it("create mode: Division shows the selected class's section, read-only", async () => {
    render(
      <StudentDetailModal
        mode="create"
        classes={classes}
        allStudents={allStudents}
        isAdmin={true}
        defaultClassId={2}
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
    const division = screen.getByLabelText("Division") as HTMLInputElement;
    expect(division.value).toBe("B");
    expect(division).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText("Class"), "1");
    expect((screen.getByLabelText("Division") as HTMLInputElement).value).toBe("A");
  });

  it("create mode: every Student Details field has a visible label", () => {
    render(
      <StudentDetailModal
        mode="create"
        classes={classes}
        allStudents={allStudents}
        isAdmin={true}
        defaultClassId={2}
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
    for (const text of [
      "First name",
      "Last name",
      "Admission number",
      "Date of birth",
      "Roll number",
      "Class",
      "Division",
      "Date of join",
      "ID",
      "Gender",
    ]) {
      const label = screen.getByText(text, { selector: "label" });
      expect(label).toBeInTheDocument();
    }
  });

  it("sibling and parent rows also render visible labels", async () => {
    render(
      <StudentDetailModal
        mode="create"
        classes={classes}
        allStudents={allStudents}
        isAdmin={true}
        defaultClassId={2}
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
    await userEvent.click(screen.getByRole("button", { name: "Add sibling" }));
    expect(screen.getByText("Select student", { selector: "label" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Add parent" }));
    expect(screen.getByText("Relationship", { selector: "label" })).toBeInTheDocument();
    // "First name" appears three times: Student Details + Sibling 1 display + Parent 1
    const firstNameLabels = screen.getAllByText("First name", { selector: "label" });
    expect(firstNameLabels).toHaveLength(3);
  });

  it("edit mode: hides the class dropdown when the student has no active enrollment", () => {
    render(
      <StudentDetailModal
        mode="edit"
        student={{ ...existingStudent, class: null }}
        classes={classes}
        allStudents={allStudents}
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
        allStudents={allStudents}
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

  it("edit mode: deleteBlocked shows the explanatory banner and Cancel, with exactly one Deactivate button", async () => {
    const onDeactivate = vi.fn();
    const onCancelDelete = vi.fn();
    render(
      <StudentDetailModal
        mode="edit"
        student={existingStudent}
        classes={classes}
        allStudents={allStudents}
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
    expect(screen.getByText(/has recorded history/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deactivate instead" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Deactivate" })).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Deactivate" }));
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
        allStudents={allStudents}
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

  it("sibling section: adds a sibling row, selecting a student auto-fills read-only fields", async () => {
    const onSave = vi.fn();
    render(
      <StudentDetailModal
        mode="create"
        classes={classes}
        allStudents={allStudents}
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

    await userEvent.click(screen.getByRole("button", { name: "Add sibling" }));
    await userEvent.selectOptions(screen.getByLabelText("Sibling 1"), "2");

    expect((screen.getByLabelText("Sibling first name") as HTMLInputElement).value).toBe("Priya");
    expect((screen.getByLabelText("Sibling last name") as HTMLInputElement).value).toBe("Sharma");
    expect((screen.getByLabelText("Sibling admission number") as HTMLInputElement).value).toBe("SCH-9");
    expect((screen.getByLabelText("Sibling gender") as HTMLInputElement).value).toBe("female");
    expect((screen.getByLabelText("Sibling class") as HTMLInputElement).value).toBe("Grade 5 A");
  });

  it("sibling section: removes a row and includes selected ids in onSave", async () => {
    const onSave = vi.fn();
    render(
      <StudentDetailModal
        mode="create"
        classes={classes}
        allStudents={allStudents}
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

    await userEvent.click(screen.getByRole("button", { name: "Add sibling" }));
    await userEvent.selectOptions(screen.getByLabelText("Sibling 1"), "2");
    await userEvent.click(screen.getByRole("button", { name: "Add sibling" }));
    await userEvent.selectOptions(screen.getByLabelText("Sibling 2"), "3");
    await userEvent.click(screen.getAllByRole("button", { name: "Remove sibling" })[0]);

    await userEvent.type(screen.getByRole("textbox", { name: "First name" }), "New");
    await userEvent.type(screen.getByRole("textbox", { name: "Last name" }), "Student");
    await userEvent.type(screen.getByRole("textbox", { name: "Admission number" }), "SCH-11");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave.mock.calls[0][0].siblingStudentIds).toEqual([3]);
  });
});
