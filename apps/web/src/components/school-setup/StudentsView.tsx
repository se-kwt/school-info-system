"use client";

import { useState } from "react";
import { StudentCard, type StudentRow } from "./StudentCard";
import { StudentDetailModal, type SaveStudentFields } from "./StudentDetailModal";

type ModalState = { mode: "create" } | { mode: "edit"; id: number } | null;

async function uploadPhoto(file: File): Promise<{ ok: true; photoUrl: string } | { ok: false; error: string }> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch("/api/students/upload-photo", { method: "POST", body: formData });
  if (!response.ok) {
    const body = await response.json();
    return { ok: false, error: body.error };
  }
  const body = await response.json();
  return { ok: true, photoUrl: body.photoUrl };
}

export function StudentsView({
  initialStudents,
  classes,
  isAdmin,
}: {
  initialStudents: StudentRow[];
  classes: { id: number; name: string; section: string }[];
  isAdmin: boolean;
}) {
  const [students, setStudents] = useState(initialStudents);
  const [classFilter, setClassFilter] = useState("all");
  const [modalState, setModalState] = useState<ModalState>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteBlockedId, setDeleteBlockedId] = useState<number | null>(null);

  const selectedClass = classFilter === "all" ? null : classes.find((klass) => String(klass.id) === classFilter);
  const filteredStudents =
    classFilter === "all"
      ? students
      : students.filter(
          (student) =>
            selectedClass && student.class?.name === selectedClass.name && student.class?.section === selectedClass.section
        );

  async function refresh() {
    const response = await fetch("/api/students");
    setStudents(await response.json());
  }

  function openCreate() {
    setModalState({ mode: "create" });
    setError(null);
    setDeleteBlockedId(null);
  }

  function openEdit(id: number) {
    setModalState({ mode: "edit", id });
    setError(null);
    setDeleteBlockedId(null);
  }

  function closeModal() {
    setModalState(null);
    setError(null);
    setDeleteBlockedId(null);
  }

  async function handleSave(fields: SaveStudentFields) {
    setError(null);

    let photoUrl: string | undefined;
    if (fields.photoFile) {
      const uploadResult = await uploadPhoto(fields.photoFile);
      if (!uploadResult.ok) {
        setError(uploadResult.error);
        return;
      }
      photoUrl = uploadResult.photoUrl;
    }

    if (modalState?.mode === "create") {
      const response = await fetch("/api/students", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: fields.name,
          dob: fields.dob,
          classId: fields.classId ?? undefined,
          admissionNo: fields.admissionNo,
          rollNumber: fields.rollNumber || undefined,
          photoUrl,
          gender: fields.gender || undefined,
          studentIdNumber: fields.studentIdNumber || undefined,
          dateOfJoin: fields.dateOfJoin || undefined,
          parents: fields.parents.map((p) => ({
            relationship: p.relationship,
            name: `${p.firstName} ${p.lastName}`.trim(),
            phone: p.phone,
            email: p.email || undefined,
          })),
          siblingStudentIds: fields.siblingStudentIds,
        }),
      });
      if (response.status === 201) {
        await refresh();
        closeModal();
        return;
      }
      setError((await response.json()).error);
      return;
    }

    if (modalState?.mode === "edit") {
      const body: {
        name: string;
        admissionNo: string;
        dob?: string;
        classId?: number;
        rollNumber?: string;
        photoUrl?: string;
        gender?: "male" | "female";
        studentIdNumber?: string;
        dateOfJoin?: string;
        parents?: { relationship: string; name: string; phone: string; email?: string }[];
        siblingStudentIds?: number[];
      } = {
        name: fields.name,
        admissionNo: fields.admissionNo,
      };
      if (fields.dob) body.dob = fields.dob;
      if (fields.classId) body.classId = fields.classId;
      if (fields.rollNumber) body.rollNumber = fields.rollNumber;
      if (photoUrl) body.photoUrl = photoUrl;
      if (fields.gender) body.gender = fields.gender;
      if (fields.studentIdNumber) body.studentIdNumber = fields.studentIdNumber;
      if (fields.dateOfJoin) body.dateOfJoin = fields.dateOfJoin;
      body.parents = fields.parents.map((p) => ({
        relationship: p.relationship,
        name: `${p.firstName} ${p.lastName}`.trim(),
        phone: p.phone,
        email: p.email || undefined,
      }));
      body.siblingStudentIds = fields.siblingStudentIds;

      const response = await fetch(`/api/students/${modalState.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        await refresh();
        closeModal();
        return;
      }
      setError((await response.json()).error);
    }
  }

  async function handleDelete() {
    if (modalState?.mode !== "edit") return;
    setError(null);
    const response = await fetch(`/api/students/${modalState.id}`, { method: "DELETE" });
    if (response.ok) {
      await refresh();
      closeModal();
      return;
    }
    const body = await response.json();
    if (body.deletable === false) {
      setDeleteBlockedId(modalState.id);
      return;
    }
    setError(body.error);
  }

  async function handleDeactivate() {
    if (modalState?.mode !== "edit") return;
    setError(null);
    const response = await fetch(`/api/students/${modalState.id}/deactivate`, { method: "PATCH" });
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    await refresh();
    closeModal();
  }

  async function handleActivate() {
    if (modalState?.mode !== "edit") return;
    setError(null);
    const response = await fetch(`/api/students/${modalState.id}/activate`, { method: "PATCH" });
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    await refresh();
  }

  const editingStudent =
    modalState?.mode === "edit" ? students.find((student) => student.id === modalState.id) : undefined;

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <select
          aria-label="Filter by class"
          value={classFilter}
          onChange={(event) => setClassFilter(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="all">All classes</option>
          {classes.map((klass) => (
            <option key={klass.id} value={klass.id}>
              {klass.name} {klass.section}
            </option>
          ))}
        </select>
        {isAdmin && (
          <button
            type="button"
            onClick={openCreate}
            className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-black"
          >
            Add new student
          </button>
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {filteredStudents.map((student) => (
          <StudentCard key={student.id} student={student} onClick={() => openEdit(student.id)} />
        ))}
      </div>

      {modalState && (
        <StudentDetailModal
          mode={modalState.mode}
          student={editingStudent}
          classes={classes}
          allStudents={students}
          isAdmin={isAdmin}
          defaultClassId={selectedClass?.id}
          serverError={error}
          deleteBlocked={modalState.mode === "edit" && deleteBlockedId === modalState.id}
          onClose={closeModal}
          onSave={handleSave}
          onDelete={handleDelete}
          onDeactivate={handleDeactivate}
          onCancelDelete={() => setDeleteBlockedId(null)}
          onActivate={handleActivate}
        />
      )}
    </div>
  );
}
