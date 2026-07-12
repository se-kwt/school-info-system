"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import type { StudentRow } from "./StudentCard";
import { FormSection } from "./FormSection";

export interface SaveStudentFields {
  name: string;
  dob: string;
  admissionNo: string;
  rollNumber: string;
  classId: number | null;
  photoFile: File | null;
  gender: "male" | "female" | "";
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
  classes: { id: number; name: string; section: string }[];
  allStudents: {
    id: number;
    name: string;
    admissionNo: string;
    gender: "male" | "female" | null;
    class: { name: string; section: string } | null;
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
  const [gender, setGender] = useState<"male" | "female" | "">(student?.gender ?? "");
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
    setParentRows((rows) => [...rows, { relationship: "Father", firstName: "", lastName: "", phone: "", email: "" }]);
  }

  function updateParentRow(index: number, field: keyof ParentRow, value: string) {
    setParentRows((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  function removeParentRow(index: number) {
    setParentRows((rows) => rows.filter((_, i) => i !== index));
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-sm font-bold text-neutral-800">
        {mode === "create" ? "Add new student" : student?.name}
      </h2>

      <div className="flex flex-col gap-4">
        <FormSection title="Student Details">
          <input
            type="text"
            aria-label="First name"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            disabled={!isAdmin}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="First name"
          />
          <input
            type="text"
            aria-label="Last name"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            disabled={!isAdmin}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="Last name"
          />
          <input
            type="text"
            aria-label="Admission number"
            value={admissionNo}
            onChange={(event) => setAdmissionNo(event.target.value)}
            disabled={!isAdmin}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="Admission number"
          />
          <input
            type="date"
            aria-label="Date of birth"
            value={dob}
            onChange={(event) => setDob(event.target.value)}
            disabled={!isAdmin}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            type="text"
            aria-label="Roll number"
            value={rollNumber}
            onChange={(event) => setRollNumber(event.target.value)}
            disabled={!isAdmin}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="Roll number (optional)"
          />
          {showClassField && (
            <select
              aria-label="Class"
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
              disabled={!isAdmin}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            >
              {mode === "edit" && <option value="">Keep current class</option>}
              {classes.map((klass) => (
                <option key={klass.id} value={klass.id}>
                  {klass.name} {klass.section}
                </option>
              ))}
            </select>
          )}
          <input
            type="date"
            aria-label="Date of join"
            value={dateOfJoin}
            onChange={(event) => setDateOfJoin(event.target.value)}
            disabled={!isAdmin}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            type="text"
            aria-label="ID"
            value={studentIdNumber}
            onChange={(event) => setStudentIdNumber(event.target.value)}
            disabled={!isAdmin}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="Student ID number"
          />
          <select
            aria-label="Gender"
            value={gender}
            onChange={(event) => setGender(event.target.value as "male" | "female" | "")}
            disabled={!isAdmin}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Select gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
          {mode === "edit" && (
            <p className="text-sm text-neutral-500">
              Status: <span className="font-semibold text-neutral-800">{student?.status}</span>
            </p>
          )}
          {isAdmin && (
            <input
              type="file"
              aria-label="Photo"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
          )}
        </FormSection>

        <FormSection title="Sibling Details">
          {siblingIds.map((siblingId, index) => {
            const selected = allStudents.find((s) => s.id === siblingId);
            return (
              <div key={index} className="flex flex-col gap-2 rounded border border-neutral-100 p-2">
                <select
                  aria-label={`Sibling ${index + 1}`}
                  value={siblingId ?? ""}
                  onChange={(event) => updateSiblingRow(index, event.target.value)}
                  disabled={!isAdmin}
                  className="rounded border border-gray-300 px-3 py-2 text-sm"
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
                <input
                  type="text"
                  aria-label="Sibling first name"
                  value={selected?.name.split(" ")[0] ?? ""}
                  disabled
                  className="rounded border border-gray-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-500"
                />
                <input
                  type="text"
                  aria-label="Sibling last name"
                  value={selected ? selected.name.split(" ").slice(1).join(" ") : ""}
                  disabled
                  className="rounded border border-gray-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-500"
                />
                <input
                  type="text"
                  aria-label="Sibling admission number"
                  value={selected?.admissionNo ?? ""}
                  disabled
                  className="rounded border border-gray-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-500"
                />
                <input
                  type="text"
                  aria-label="Sibling gender"
                  value={selected?.gender ?? ""}
                  disabled
                  className="rounded border border-gray-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-500"
                />
                <input
                  type="text"
                  aria-label="Sibling class"
                  value={selected?.class ? `${selected.class.name} ${selected.class.section}` : ""}
                  disabled
                  className="rounded border border-gray-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-500"
                />
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => removeSiblingRow(index)}
                    className="self-start text-xs font-semibold text-red-600"
                  >
                    Remove sibling
                  </button>
                )}
              </div>
            );
          })}
          {isAdmin && (
            <button
              type="button"
              onClick={addSiblingRow}
              className="self-start text-xs font-semibold text-neutral-700"
            >
              Add sibling
            </button>
          )}
        </FormSection>

        <FormSection title="Parent Details">
          {parentRows.map((row, index) => (
            <div key={index} className="flex flex-col gap-2 rounded border border-neutral-100 p-2">
              <select
                aria-label={`Parent ${index + 1} relationship`}
                value={row.relationship}
                onChange={(event) => updateParentRow(index, "relationship", event.target.value)}
                disabled={!isAdmin}
                className="rounded border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="Father">Father</option>
                <option value="Mother">Mother</option>
                <option value="Guardian">Guardian</option>
                <option value="Other">Other</option>
              </select>
              <input
                type="text"
                aria-label={`Parent ${index + 1} first name`}
                value={row.firstName}
                onChange={(event) => updateParentRow(index, "firstName", event.target.value)}
                disabled={!isAdmin}
                className="rounded border border-gray-300 px-3 py-2 text-sm"
                placeholder="First name"
              />
              <input
                type="text"
                aria-label={`Parent ${index + 1} last name`}
                value={row.lastName}
                onChange={(event) => updateParentRow(index, "lastName", event.target.value)}
                disabled={!isAdmin}
                className="rounded border border-gray-300 px-3 py-2 text-sm"
                placeholder="Last name"
              />
              <input
                type="email"
                aria-label={`Parent ${index + 1} email`}
                value={row.email}
                onChange={(event) => updateParentRow(index, "email", event.target.value)}
                disabled={!isAdmin}
                className="rounded border border-gray-300 px-3 py-2 text-sm"
                placeholder="Email"
              />
              <input
                type="tel"
                aria-label={`Parent ${index + 1} mobile number`}
                value={row.phone}
                onChange={(event) => updateParentRow(index, "phone", event.target.value)}
                disabled={!isAdmin}
                className="rounded border border-gray-300 px-3 py-2 text-sm"
                placeholder="Mobile number"
              />
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => removeParentRow(index)}
                  className="self-start text-xs font-semibold text-red-600"
                >
                  Remove parent
                </button>
              )}
            </div>
          ))}
          {isAdmin && (
            <button
              type="button"
              onClick={addParentRow}
              className="self-start text-xs font-semibold text-neutral-700"
            >
              Add parent
            </button>
          )}
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
