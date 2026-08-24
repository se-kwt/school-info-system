"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import type { StaffRow } from "./StaffCard";
import { FormSection } from "./FormSection";
import { Field } from "./Field";
import { formatMoney } from "@/lib/money";

type Role = "teacher" | "admin" | "accountant";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SaveStaffFields {
  name: string;
  phone: string;
  role: Role;
  classId: number | null;
  subjectId: number | null;
  email: string;
  qualification: string;
  designation: string;
  joiningDate: string;
  salary: string;
  address: string;
  photoFile: File | null;
}

export function StaffDetailModal({
  mode,
  staff,
  classes,
  subjects,
  isSelf,
  serverError,
  deleteBlocked,
  isSubmitting = false,
  onClose,
  onSave,
  onDelete,
  onDeactivate,
  onCancelDelete,
  onActivate,
}: {
  mode: "create" | "edit";
  staff?: StaffRow;
  classes: { id: number; gradeId: number; gradeName: string; section: string }[];
  subjects: { id: number; name: string; gradeId: number }[];
  isSelf: boolean;
  serverError: string | null;
  deleteBlocked: boolean;
  isSubmitting?: boolean;
  onClose: () => void;
  onSave: (fields: SaveStaffFields) => void;
  onDelete: () => void;
  onDeactivate: () => void;
  onCancelDelete: () => void;
  onActivate: () => void;
}) {
  const [name, setName] = useState(staff?.name ?? "");
  const [phone, setPhone] = useState(staff?.phone ?? "");
  const [role, setRole] = useState<Role>(staff?.role ?? "teacher");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [email, setEmail] = useState(staff?.email ?? "");
  const [qualification, setQualification] = useState(staff?.qualification ?? "");
  const [designation, setDesignation] = useState(staff?.designation ?? "");
  const [joiningDate, setJoiningDate] = useState(staff?.joiningDate ?? "");
  const [salary, setSalary] = useState(staff?.salary != null ? String(staff.salary) : "");
  const [address, setAddress] = useState(staff?.address ?? "");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const selectedClass = classes.find((klass) => String(klass.id) === classId);
  const availableSubjects = selectedClass ? subjects.filter((s) => s.gradeId === selectedClass.gradeId) : [];

  function handleSave() {
    if (email && !EMAIL_PATTERN.test(email)) {
      setFormError("Enter a valid email address");
      return;
    }
    if (salary !== "" && Number(salary) < 0) {
      setFormError("Salary cannot be negative");
      return;
    }
    setFormError(null);
    onSave({
      name,
      phone,
      role,
      classId: role === "teacher" && classId ? Number(classId) : null,
      subjectId: role === "teacher" && classId && subjectId ? Number(subjectId) : null,
      email,
      qualification,
      designation,
      joiningDate,
      salary,
      address,
      photoFile,
    });
  }

  return (
    <Modal onClose={onClose} title={mode === "create" ? "Add new staff" : staff?.name ?? "Edit staff"}>
      <h2 className="text-sm font-bold text-neutral-800">
        {mode === "create" ? "Add new staff" : staff?.name}
      </h2>

      {mode === "edit" && staff && (
        <div className="flex flex-col gap-1 rounded-lg bg-neutral-50 p-3 text-xs text-neutral-600">
          {staff.email && <p>Email: {staff.email}</p>}
          {staff.qualification && <p>Qualification: {staff.qualification}</p>}
          {staff.designation && <p>Designation: {staff.designation}</p>}
          {staff.joiningDate && <p>Joining date: {staff.joiningDate}</p>}
          {staff.salary != null && <p>Salary: {formatMoney(staff.salary)}</p>}
          {staff.address && <p>Address: {staff.address}</p>}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <input
          type="text"
          aria-label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="Name"
        />
        <input
          type="tel"
          aria-label="Phone"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="Phone number"
        />
        <select
          aria-label="Role"
          value={role}
          onChange={(event) => setRole(event.target.value as Role)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="teacher">Teacher</option>
          <option value="admin">Admin</option>
          <option value="accountant">Accountant</option>
        </select>
        {role === "teacher" && (
          <>
            <select
              aria-label="Class assignment"
              value={classId}
              onChange={(event) => { setClassId(event.target.value); setSubjectId(""); }}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">No class assignment</option>
              {classes.map((klass) => (
                <option key={klass.id} value={klass.id}>
                  {klass.gradeName} {klass.section}
                </option>
              ))}
            </select>
            {classId && (
              <select
                aria-label="Subject"
                value={subjectId}
                onChange={(event) => setSubjectId(event.target.value)}
                className="rounded border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Select subject</option>
                {availableSubjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>{subject.name}</option>
                ))}
              </select>
            )}
          </>
        )}
      </div>

      <FormSection number={1} title="Employment details">
        <Field label="Email" htmlFor="email">
          <input
            id="email"
            type="email"
            aria-label="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
            placeholder="Email"
          />
        </Field>
        <Field label="Qualification" htmlFor="qualification">
          <input
            id="qualification"
            type="text"
            aria-label="Qualification"
            value={qualification}
            onChange={(event) => setQualification(event.target.value)}
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
            placeholder="Qualification"
          />
        </Field>
        <Field label="Designation" htmlFor="designation">
          <input
            id="designation"
            type="text"
            aria-label="Designation"
            value={designation}
            onChange={(event) => setDesignation(event.target.value)}
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
            placeholder="Designation"
          />
        </Field>
        <Field label="Joining date" htmlFor="joiningDate">
          <input
            id="joiningDate"
            type="date"
            aria-label="Joining date"
            value={joiningDate}
            onChange={(event) => setJoiningDate(event.target.value)}
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Salary" htmlFor="salary">
          <input
            id="salary"
            type="number"
            min="0"
            step="1"
            aria-label="Salary"
            value={salary}
            onChange={(event) => setSalary(event.target.value)}
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
            placeholder="Salary"
          />
        </Field>
        <Field label="Address" htmlFor="address">
          <input
            id="address"
            type="text"
            aria-label="Address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
            placeholder="Address"
          />
        </Field>
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
      </FormSection>

      {(formError || serverError) && <p className="text-sm text-red-600">{formError ?? serverError}</p>}

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          {mode === "edit" && !isSelf && !deleteBlocked && (
            <button
              type="button"
              onClick={onDelete}
              disabled={isSubmitting}
              className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition-all hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Delete
            </button>
          )}
          {mode === "edit" && staff?.status === "active" && (
            <button
              type="button"
              onClick={onDeactivate}
              disabled={isSubmitting}
              className="rounded-lg border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-700 transition-all hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Deactivate
            </button>
          )}
          {mode === "edit" && staff?.status === "inactive" && (
            <button
              type="button"
              onClick={onActivate}
              disabled={isSubmitting}
              className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 transition-all hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Activate
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSubmitting}
          className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save
        </button>
      </div>

      {deleteBlocked && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm">
          <p>{staff?.name} has recorded activity and cannot be permanently deleted.</p>
          <div className="mt-2 flex gap-2">
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
