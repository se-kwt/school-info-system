"use client";

import { Fragment, useState } from "react";

interface StudentRow {
  id: number;
  name: string;
  admissionNo: string;
  status: "active" | "left" | "transferred" | "graduated" | "inactive";
  class: { name: string; section: string } | null;
  parents: { name: string; phone: string }[];
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
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [classId, setClassId] = useState(classes[0] ? String(classes[0].id) : "");
  const [admissionNo, setAdmissionNo] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [parentName, setParentName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDob, setEditDob] = useState("");
  const [editAdmissionNo, setEditAdmissionNo] = useState("");
  const [editClassId, setEditClassId] = useState("");
  const [deleteBlockedId, setDeleteBlockedId] = useState<number | null>(null);

  async function refresh() {
    const response = await fetch("/api/students");
    setStudents(await response.json());
  }

  async function handleCreate() {
    setError(null);
    const response = await fetch("/api/students", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        dob,
        classId: classId ? Number(classId) : undefined,
        admissionNo,
        parentPhone,
        parentName: parentName || undefined,
      }),
    });
    if (response.status === 201) {
      setName("");
      setDob("");
      setAdmissionNo("");
      setParentPhone("");
      setParentName("");
      await refresh();
      return;
    }
    setError((await response.json()).error);
  }

  function startEdit(student: StudentRow) {
    setEditingId(student.id);
    setEditName(student.name);
    setEditAdmissionNo(student.admissionNo);
    setEditDob("");
    setEditClassId("");
    setError(null);
    setDeleteBlockedId(null);
  }

  async function handleSaveEdit(id: number) {
    setError(null);
    const body: { name: string; admissionNo: string; dob?: string; classId?: number } = {
      name: editName,
      admissionNo: editAdmissionNo,
    };
    if (editDob) body.dob = editDob;
    if (editClassId) body.classId = Number(editClassId);

    const response = await fetch(`/api/students/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    setEditingId(null);
    await refresh();
  }

  async function handleDelete(id: number) {
    setError(null);
    const response = await fetch(`/api/students/${id}`, { method: "DELETE" });
    if (response.ok) {
      setDeleteBlockedId(null);
      await refresh();
      return;
    }
    const body = await response.json();
    if (body.deletable === false) {
      setDeleteBlockedId(id);
      return;
    }
    setError(body.error);
  }

  async function handleDeactivate(id: number) {
    setError(null);
    const response = await fetch(`/api/students/${id}/deactivate`, { method: "PATCH" });
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    setDeleteBlockedId(null);
    await refresh();
  }

  async function handleActivate(id: number) {
    setError(null);
    const response = await fetch(`/api/students/${id}/activate`, { method: "PATCH" });
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    await refresh();
  }

  return (
    <div className="mt-4">
      {isAdmin && (
        <div className="flex flex-col gap-2">
          <input
            type="text"
            aria-label="Student name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
            placeholder="Student name"
          />
          <input
            type="date"
            aria-label="Date of birth"
            value={dob}
            onChange={(event) => setDob(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
          />
          <select
            aria-label="Class"
            value={classId}
            onChange={(event) => setClassId(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
          >
            {classes.map((klass) => (
              <option key={klass.id} value={klass.id}>
                {klass.name} {klass.section}
              </option>
            ))}
          </select>
          <input
            type="text"
            aria-label="Admission number"
            value={admissionNo}
            onChange={(event) => setAdmissionNo(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
            placeholder="Admission number"
          />
          <input
            type="tel"
            aria-label="Parent phone"
            value={parentPhone}
            onChange={(event) => setParentPhone(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
            placeholder="Parent phone number"
          />
          <input
            type="text"
            aria-label="Parent name"
            value={parentName}
            onChange={(event) => setParentName(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
            placeholder="Parent name (only if this phone is new)"
          />
          <button type="button" onClick={handleCreate} className="rounded bg-blue-600 px-3 py-2 text-white">
            Create Student
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr>
            <th className="border-b border-gray-200 pb-2">Name</th>
            <th className="border-b border-gray-200 pb-2">Admission No.</th>
            <th className="border-b border-gray-200 pb-2">Class</th>
            <th className="border-b border-gray-200 pb-2">Parent(s)</th>
            <th className="border-b border-gray-200 pb-2">Status</th>
            {isAdmin && <th className="border-b border-gray-200 pb-2">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {students.map((student) => (
            <Fragment key={student.id}>
              <tr>
                <td className="border-b border-gray-100 py-2">{student.name}</td>
                <td className="border-b border-gray-100 py-2">{student.admissionNo}</td>
                <td className="border-b border-gray-100 py-2">
                  {student.class ? `${student.class.name} ${student.class.section}` : "Unassigned"}
                </td>
                <td className="border-b border-gray-100 py-2">
                  {student.parents.map((parent) => `${parent.name} (${parent.phone})`).join(", ") || "None"}
                </td>
                <td className="border-b border-gray-100 py-2">
                  {student.status !== "active" && (
                    <span className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-600">{student.status}</span>
                  )}
                </td>
                {isAdmin && (
                  <td className="border-b border-gray-100 py-2">
                    <button type="button" onClick={() => startEdit(student)} className="mr-3 text-blue-600 underline">
                      Edit
                    </button>
                    <button type="button" onClick={() => handleDelete(student.id)} className="mr-3 text-red-600 underline">
                      Delete
                    </button>
                    {student.status !== "active" && (
                      <button
                        type="button"
                        onClick={() => handleActivate(student.id)}
                        className="text-green-700 underline"
                      >
                        Activate
                      </button>
                    )}
                  </td>
                )}
              </tr>
              {editingId === student.id && (
                <tr>
                  <td colSpan={6} className="border-b border-gray-100 bg-gray-50 py-2">
                    <div className="flex flex-wrap items-center gap-2 px-2">
                      <input
                        type="text"
                        aria-label={`Edit name for ${student.name}`}
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        className="rounded border border-gray-300 px-2 py-1"
                      />
                      <input
                        type="date"
                        aria-label={`Edit date of birth for ${student.name}`}
                        value={editDob}
                        onChange={(event) => setEditDob(event.target.value)}
                        className="rounded border border-gray-300 px-2 py-1"
                      />
                      <input
                        type="text"
                        aria-label={`Edit admission number for ${student.name}`}
                        value={editAdmissionNo}
                        onChange={(event) => setEditAdmissionNo(event.target.value)}
                        className="rounded border border-gray-300 px-2 py-1"
                      />
                      {student.class && (
                        <select
                          aria-label={`Edit class for ${student.name}`}
                          value={editClassId}
                          onChange={(event) => setEditClassId(event.target.value)}
                          className="rounded border border-gray-300 px-2 py-1"
                        >
                          <option value="">Keep current class</option>
                          {classes.map((klass) => (
                            <option key={klass.id} value={klass.id}>
                              {klass.name} {klass.section}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(student.id)}
                        className="rounded bg-blue-600 px-2 py-1 text-white"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded border border-gray-300 px-2 py-1"
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              {deleteBlockedId === student.id && (
                <tr>
                  <td colSpan={6} className="border-b border-gray-100 bg-amber-50 py-2">
                    <div className="flex flex-wrap items-center gap-2 px-2 text-sm">
                      <span>{student.name} has recorded history and cannot be permanently deleted.</span>
                      <button
                        type="button"
                        onClick={() => handleDeactivate(student.id)}
                        className="rounded bg-amber-600 px-2 py-1 text-white"
                      >
                        Deactivate instead
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteBlockedId(null)}
                        className="rounded border border-gray-300 px-2 py-1"
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
