"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import type { StudentRow } from "./StudentCard";

export interface SaveStudentFields {
  name: string;
  dob: string;
  admissionNo: string;
  rollNumber: string;
  classId: number | null;
  photoFile: File | null;
  parentPhone: string;
  parentName: string;
}

export function StudentDetailModal({
  mode,
  student,
  classes,
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
  const [name, setName] = useState(student?.name ?? "");
  const [dob, setDob] = useState("");
  const [admissionNo, setAdmissionNo] = useState(student?.admissionNo ?? "");
  const [rollNumber, setRollNumber] = useState(student?.rollNumber ?? "");
  const [classId, setClassId] = useState(
    mode === "create" ? String(defaultClassId ?? classes[0]?.id ?? "") : ""
  );
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [parentPhone, setParentPhone] = useState("");
  const [parentName, setParentName] = useState("");

  const showClassField = mode === "create" || Boolean(student?.class);

  function handleSave() {
    onSave({
      name,
      dob,
      admissionNo,
      rollNumber,
      classId: classId ? Number(classId) : null,
      photoFile,
      parentPhone,
      parentName,
    });
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-sm font-bold text-neutral-800">
        {mode === "create" ? "Add new student" : student?.name}
      </h2>

      <div className="flex flex-col gap-2">
        <input
          type="text"
          aria-label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={!isAdmin}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="Student name"
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
          aria-label="Admission number"
          value={admissionNo}
          onChange={(event) => setAdmissionNo(event.target.value)}
          disabled={!isAdmin}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="Admission number"
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
        {isAdmin && (
          <input
            type="file"
            aria-label="Photo"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
        )}
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
        {mode === "create" && (
          <>
            <input
              type="tel"
              aria-label="Parent phone"
              value={parentPhone}
              onChange={(event) => setParentPhone(event.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="Parent phone number"
            />
            <input
              type="text"
              aria-label="Parent name"
              value={parentName}
              onChange={(event) => setParentName(event.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="Parent name (only if this phone is new)"
            />
          </>
        )}
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
