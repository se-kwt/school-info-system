"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import type { StaffRow } from "./StaffCard";

type Role = "teacher" | "admin" | "accountant";

export interface SaveStaffFields {
  name: string;
  phone: string;
  role: Role;
  classId: number | null;
  subject: string | null;
}

export function StaffDetailModal({
  mode,
  staff,
  classes,
  isSelf,
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
  staff?: StaffRow;
  classes: { id: number; name: string; section: string }[];
  isSelf: boolean;
  serverError: string | null;
  deleteBlocked: boolean;
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
  const [subject, setSubject] = useState(staff?.classAssignment?.subject ?? "");

  function handleSave() {
    onSave({
      name,
      phone,
      role,
      classId: role === "teacher" && classId ? Number(classId) : null,
      subject: role === "teacher" && classId ? subject : null,
    });
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-sm font-bold text-neutral-800">
        {mode === "create" ? "Add new staff" : staff?.name}
      </h2>

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
              onChange={(event) => setClassId(event.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">No class assignment</option>
              {classes.map((klass) => (
                <option key={klass.id} value={klass.id}>
                  {klass.name} {klass.section}
                </option>
              ))}
            </select>
            <input
              type="text"
              aria-label="Subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="Subject (required if assigning a class)"
            />
          </>
        )}
      </div>

      {serverError && <p className="text-sm text-red-600">{serverError}</p>}

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          {mode === "edit" && !isSelf && !deleteBlocked && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition-all hover:bg-red-50"
            >
              Delete
            </button>
          )}
          {mode === "edit" && staff?.status === "inactive" && (
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

      {deleteBlocked && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm">
          <p>{staff?.name} has recorded activity and cannot be permanently deleted.</p>
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
