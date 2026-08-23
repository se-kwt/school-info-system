"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import type { StudentRow } from "./StudentCard";
import { FormSection } from "./FormSection";
import { Field } from "./Field";

export interface SaveStudentFields {
  name: string;
  dob: string;
  admissionNo: string;
  rollNumber: string;
  classId: number | null;
  photoFile: File | null;
  gender: "male" | "female" | "other" | "";
  studentIdNumber: string;
  dateOfJoin: string;
  siblingStudentIds: number[];
  parents: { relationship: string; firstName: string; lastName: string; phone: string; email: string }[];
}

interface ParentRow {
  relationship: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}

export function StudentDetailModal({
  mode,
  student,
  classes,
  allStudents,
  isAdmin,
  defaultClassId,
  serverError,
  deleteBlocked,
  onClose,
  onSave,
  onDelete,
  onDeactivate,
  onCancelDelete,
  onActivate,
}: {
  mode: "create" | "edit";
  student?: StudentRow;
  classes: { id: number; gradeName: string; section: string }[];
  allStudents: {
    id: number;
    name: string;
    admissionNo: string;
    gender: "male" | "female" | "other" | null;
    class: { gradeName: string; section: string } | null;
  }[];
  isAdmin: boolean;
  defaultClassId?: number;
  serverError: string | null;
  deleteBlocked: boolean;
  onClose: () => void;
  onSave: (fields: SaveStudentFields) => void;
  onDelete: () => void;
  onDeactivate: () => void;
  onCancelDelete: () => void;
  onActivate: () => void;
}) {
  const [firstName, setFirstName] = useState(student?.name.split(" ")[0] ?? "");
  const [lastName, setLastName] = useState(student ? student.name.split(" ").slice(1).join(" ") : "");
  const [dob, setDob] = useState("");
  const [admissionNo, setAdmissionNo] = useState(student?.admissionNo ?? "");
  const [rollNumber, setRollNumber] = useState(student?.rollNumber ?? "");
  const [classId, setClassId] = useState(
    mode === "create" ? String(defaultClassId ?? classes[0]?.id ?? "") : ""
  );
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [gender, setGender] = useState<"male" | "female" | "other" | "">(student?.gender ?? "");
  const [studentIdNumber, setStudentIdNumber] = useState(student?.studentIdNumber ?? "");
  const [dateOfJoin, setDateOfJoin] = useState(student?.dateOfJoin ?? "");
  const [siblingIds, setSiblingIds] = useState<(number | null)[]>(
    student?.siblings.map((s) => s.id) ?? []
  );
  const [parentRows, setParentRows] = useState<ParentRow[]>(
    (student?.parents ?? []).map((p) => ({
      relationship: p.relationship,
      firstName: p.name.split(" ")[0] ?? "",
      lastName: p.name.split(" ").slice(1).join(" "),
      phone: p.phone,
      email: p.email ?? "",
    }))
  );

  const showClassField = mode === "create" || Boolean(student?.class);

  function handleSave() {
    onSave({
      name: `${firstName} ${lastName}`.trim(),
      dob,
      admissionNo,
      rollNumber,
      classId: classId ? Number(classId) : null,
      photoFile,
      gender,
      studentIdNumber,
      dateOfJoin,
      siblingStudentIds: siblingIds.filter((id): id is number => id !== null),
      parents: parentRows,
    });
  }

  function addSiblingRow() {
    setSiblingIds((ids) => [...ids, null]);
  }

  function updateSiblingRow(index: number, value: string) {
    setSiblingIds((ids) => ids.map((id, i) => (i === index ? (value ? Number(value) : null) : id)));
  }

  function removeSiblingRow(index: number) {
    setSiblingIds((ids) => ids.filter((_, i) => i !== index));
  }

  function addParentRow() {
    setParentRows((rows) => [...rows, { relationship: "father", firstName: "", lastName: "", phone: "", email: "" }]);
  }

  function updateParentRow(index: number, field: keyof ParentRow, value: string) {
    setParentRows((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  function removeParentRow(index: number) {
    setParentRows((rows) => rows.filter((_, i) => i !== index));
  }

  return (
    <Modal onClose={onClose} maxWidthClassName="max-w-2xl">
      <h2 className="text-sm font-bold text-neutral-800">
        {mode === "create" ? "Add new student" : student?.name}
      </h2>

      <div className="flex flex-col gap-4">
        <FormSection number={1} title="Student Details">
          <Field label="First name" htmlFor="firstName">
            <input
              id="firstName"
              type="text"
              aria-label="First name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              disabled={!isAdmin}
              className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
              placeholder="First name"
            />
          </Field>
          <Field label="Last name" htmlFor="lastName">
            <input
              id="lastName"
              type="text"
              aria-label="Last name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              disabled={!isAdmin}
              className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
              placeholder="Last name"
            />
          </Field>
          <Field label="Admission number" htmlFor="admissionNo">
            <input
              id="admissionNo"
              type="text"
              aria-label="Admission number"
              value={admissionNo}
              onChange={(event) => setAdmissionNo(event.target.value)}
              disabled={!isAdmin}
              className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
              placeholder="Admission number"
            />
          </Field>
          <Field label="Date of birth" htmlFor="dob">
            <input
              id="dob"
              type="date"
              aria-label="Date of birth"
              value={dob}
              onChange={(event) => setDob(event.target.value)}
              disabled={!isAdmin}
              className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Roll number" htmlFor="rollNumber">
            <input
              id="rollNumber"
              type="text"
              aria-label="Roll number"
              value={rollNumber}
              onChange={(event) => setRollNumber(event.target.value)}
              disabled={!isAdmin}
              className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
              placeholder="Roll number (optional)"
            />
          </Field>
          {showClassField && (
            <Field label="Class" htmlFor="classId">
              <select
                id="classId"
                aria-label="Class"
                value={classId}
                onChange={(event) => setClassId(event.target.value)}
                disabled={!isAdmin}
                className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
              >
                {mode === "edit" && <option value="">Keep current class</option>}
                {classes.map((klass) => (
                  <option key={klass.id} value={klass.id}>
                    {klass.gradeName} {klass.section}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Division" htmlFor="division">
            <input
              id="division"
              type="text"
              aria-label="Division"
              value={classes.find((klass) => String(klass.id) === classId)?.section ?? ""}
              disabled
              className="w-full rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2 text-sm text-neutral-500"
              placeholder="Division"
            />
          </Field>
          <Field label="Date of join" htmlFor="dateOfJoin">
            <input
              id="dateOfJoin"
              type="date"
              aria-label="Date of join"
              value={dateOfJoin}
              onChange={(event) => setDateOfJoin(event.target.value)}
              disabled={!isAdmin}
              className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
            />
          </Field>
          <Field label="ID" htmlFor="studentIdNumber">
            <input
              id="studentIdNumber"
              type="text"
              aria-label="ID"
              value={studentIdNumber}
              onChange={(event) => setStudentIdNumber(event.target.value)}
              disabled={!isAdmin}
              className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
              placeholder="Student ID number"
            />
          </Field>
          <Field label="Gender" htmlFor="gender">
            <select
              id="gender"
              aria-label="Gender"
              value={gender}
              onChange={(event) => setGender(event.target.value as "male" | "female" | "other" | "")}
              disabled={!isAdmin}
              className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
            >
              <option value="">Select gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </Field>
          {mode === "edit" && (
            <div className="col-span-2 flex flex-col gap-1">
              <span className="text-xs font-medium text-neutral-600">Status</span>
              <div className="w-full rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2 text-sm font-semibold text-neutral-800">
                {student?.status}
              </div>
            </div>
          )}
          {isAdmin && (
            <Field label="Photo" htmlFor="photo" className="col-span-2">
              <input
                id="photo"
                type="file"
                aria-label="Photo"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)}
                className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
              />
            </Field>
          )}
        </FormSection>

        <FormSection number={2} title="Sibling Details">
          <div className="col-span-2 flex flex-col gap-3">
            {siblingIds.map((siblingId, index) => {
              const selected = allStudents.find((s) => s.id === siblingId);
              return (
                <div key={index} className="rounded-xl border border-neutral-100 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase text-neutral-400">
                      Sibling {index + 1}
                    </span>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => removeSiblingRow(index)}
                        className="text-xs font-semibold text-red-600"
                      >
                        Remove sibling
                      </button>
                    )}
                  </div>
                  <div className="mb-3">
                    <Field label="Select student" htmlFor={`sibling-${index}-select`}>
                      <select
                        id={`sibling-${index}-select`}
                        aria-label={`Sibling ${index + 1}`}
                        value={siblingId ?? ""}
                        onChange={(event) => updateSiblingRow(index, event.target.value)}
                        disabled={!isAdmin}
                        className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
                      >
                        <option value="">Select a student</option>
                        {allStudents
                          .filter((s) => s.id !== student?.id)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.admissionNo})
                            </option>
                          ))}
                      </select>
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="First name" htmlFor={`sibling-${index}-first`}>
                      <input
                        id={`sibling-${index}-first`}
                        type="text"
                        aria-label="Sibling first name"
                        value={selected?.name.split(" ")[0] ?? ""}
                        disabled
                        className="w-full rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2 text-sm text-neutral-500"
                      />
                    </Field>
                    <Field label="Last name" htmlFor={`sibling-${index}-last`}>
                      <input
                        id={`sibling-${index}-last`}
                        type="text"
                        aria-label="Sibling last name"
                        value={selected ? selected.name.split(" ").slice(1).join(" ") : ""}
                        disabled
                        className="w-full rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2 text-sm text-neutral-500"
                      />
                    </Field>
                    <Field label="Admission number" htmlFor={`sibling-${index}-admission`}>
                      <input
                        id={`sibling-${index}-admission`}
                        type="text"
                        aria-label="Sibling admission number"
                        value={selected?.admissionNo ?? ""}
                        disabled
                        className="w-full rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2 text-sm text-neutral-500"
                      />
                    </Field>
                    <Field label="Gender" htmlFor={`sibling-${index}-gender`}>
                      <input
                        id={`sibling-${index}-gender`}
                        type="text"
                        aria-label="Sibling gender"
                        value={selected?.gender ?? ""}
                        disabled
                        className="w-full rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2 text-sm text-neutral-500"
                      />
                    </Field>
                    <Field label="Class" htmlFor={`sibling-${index}-class`} className="col-span-2">
                      <input
                        id={`sibling-${index}-class`}
                        type="text"
                        aria-label="Sibling class"
                        value={selected?.class ? `${selected.class.gradeName} ${selected.class.section}` : ""}
                        disabled
                        className="w-full rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2 text-sm text-neutral-500"
                      />
                    </Field>
                  </div>
                </div>
              );
            })}
            {isAdmin && (
              <button
                type="button"
                onClick={addSiblingRow}
                className="self-start text-xs font-semibold text-indigo-600"
              >
                Add sibling
              </button>
            )}
          </div>
        </FormSection>

        <FormSection number={3} title="Parent Details">
          <div className="col-span-2 flex flex-col gap-3">
            {parentRows.map((row, index) => (
              <div key={index} className="rounded-xl border border-neutral-100 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase text-neutral-400">
                    Parent {index + 1}
                  </span>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => removeParentRow(index)}
                      className="text-xs font-semibold text-red-600"
                    >
                      Remove parent
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Relationship" htmlFor={`parent-${index}-relationship`}>
                    <select
                      id={`parent-${index}-relationship`}
                      aria-label={`Parent ${index + 1} relationship`}
                      value={row.relationship}
                      onChange={(event) => updateParentRow(index, "relationship", event.target.value)}
                      disabled={!isAdmin}
                      className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
                    >
                      <option value="father">Father</option>
                      <option value="mother">Mother</option>
                      <option value="guardian">Guardian</option>
                      <option value="grandparent">Grandparent</option>
                      <option value="sibling">Sibling</option>
                      <option value="other">Other</option>
                    </select>
                  </Field>
                  <div />
                  <Field label="First name" htmlFor={`parent-${index}-first`}>
                    <input
                      id={`parent-${index}-first`}
                      type="text"
                      aria-label={`Parent ${index + 1} first name`}
                      value={row.firstName}
                      onChange={(event) => updateParentRow(index, "firstName", event.target.value)}
                      disabled={!isAdmin}
                      className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
                      placeholder="First name"
                    />
                  </Field>
                  <Field label="Last name" htmlFor={`parent-${index}-last`}>
                    <input
                      id={`parent-${index}-last`}
                      type="text"
                      aria-label={`Parent ${index + 1} last name`}
                      value={row.lastName}
                      onChange={(event) => updateParentRow(index, "lastName", event.target.value)}
                      disabled={!isAdmin}
                      className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
                      placeholder="Last name"
                    />
                  </Field>
                  <Field label="Email" htmlFor={`parent-${index}-email`}>
                    <input
                      id={`parent-${index}-email`}
                      type="email"
                      aria-label={`Parent ${index + 1} email`}
                      value={row.email}
                      onChange={(event) => updateParentRow(index, "email", event.target.value)}
                      disabled={!isAdmin}
                      className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
                      placeholder="Email"
                    />
                  </Field>
                  <Field label="Mobile number" htmlFor={`parent-${index}-phone`}>
                    <input
                      id={`parent-${index}-phone`}
                      type="tel"
                      aria-label={`Parent ${index + 1} mobile number`}
                      value={row.phone}
                      onChange={(event) => updateParentRow(index, "phone", event.target.value)}
                      disabled={!isAdmin}
                      className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
                      placeholder="Mobile number"
                    />
                  </Field>
                </div>
              </div>
            ))}
            {isAdmin && (
              <button
                type="button"
                onClick={addParentRow}
                className="self-start text-xs font-semibold text-indigo-600"
              >
                Add parent
              </button>
            )}
          </div>
        </FormSection>
      </div>

      {serverError && <p className="text-sm text-red-600">{serverError}</p>}

      {isAdmin && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            {mode === "edit" && !deleteBlocked && (
              <button
                type="button"
                onClick={onDelete}
                className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition-all hover:bg-red-50"
              >
                Delete
              </button>
            )}
            {mode === "edit" && student?.status !== "active" && (
              <button
                type="button"
                onClick={onActivate}
                className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 transition-all hover:bg-emerald-50"
              >
                Activate
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-black"
          >
            Save
          </button>
        </div>
      )}

      {deleteBlocked && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm">
          <p>{student?.name} has recorded history and cannot be permanently deleted.</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onDeactivate}
              className="rounded bg-amber-600 px-2 py-1 text-xs font-semibold text-white"
            >
              Deactivate instead
            </button>
            <button
              type="button"
              onClick={onCancelDelete}
              className="rounded border border-gray-300 px-2 py-1 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
