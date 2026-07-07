"use client";

import { Fragment, useState } from "react";

type Role = "teacher" | "admin" | "accountant";

interface StaffRow {
  id: number;
  name: string;
  phone: string;
  role: Role;
  status: "active" | "inactive";
  classAssignment: { className: string; section: string; subject: string } | null;
}

export function StaffView({
  initialStaff,
  classes,
  currentUserId,
}: {
  initialStaff: StaffRow[];
  classes: { id: number; name: string; section: string }[];
  currentUserId: number;
}) {
  const [staff, setStaff] = useState(initialStaff);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("teacher");
  const [classId, setClassId] = useState("");
  const [subject, setSubject] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState<Role>("teacher");
  const [editClassId, setEditClassId] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [deleteBlockedId, setDeleteBlockedId] = useState<number | null>(null);

  async function refresh() {
    const response = await fetch("/api/staff");
    setStaff(await response.json());
  }

  async function handleCreate() {
    setError(null);
    const response = await fetch("/api/staff", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        phone,
        role,
        classId: role === "teacher" && classId ? Number(classId) : undefined,
        subject: role === "teacher" && subject ? subject : undefined,
      }),
    });
    if (response.status === 201) {
      setName("");
      setPhone("");
      setClassId("");
      setSubject("");
      await refresh();
      return;
    }
    setError((await response.json()).error);
  }

  function startEdit(member: StaffRow) {
    setEditingId(member.id);
    setEditName(member.name);
    setEditPhone(member.phone);
    setEditRole(member.role);
    setEditClassId("");
    setEditSubject(member.classAssignment?.subject ?? "");
    setError(null);
    setDeleteBlockedId(null);
  }

  async function handleSaveEdit(id: number) {
    setError(null);
    const body: {
      name: string;
      phone: string;
      role: Role;
      classId?: number | null;
      subject?: string | null;
    } = { name: editName, phone: editPhone, role: editRole };
    if (editRole === "teacher") {
      body.classId = editClassId ? Number(editClassId) : null;
      body.subject = editClassId ? editSubject : null;
    } else {
      body.classId = null;
    }

    const response = await fetch(`/api/staff/${id}`, {
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
    const response = await fetch(`/api/staff/${id}`, { method: "DELETE" });
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
    const response = await fetch(`/api/staff/${id}/deactivate`, { method: "PATCH" });
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    setDeleteBlockedId(null);
    await refresh();
  }

  async function handleActivate(id: number) {
    setError(null);
    const response = await fetch(`/api/staff/${id}/activate`, { method: "PATCH" });
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    await refresh();
  }

  return (
    <div className="mt-4">
      <div className="flex flex-col gap-2">
        <input
          type="text"
          aria-label="Staff name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
          placeholder="Name"
        />
        <input
          type="tel"
          aria-label="Staff phone"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
          placeholder="Phone number"
        />
        <select
          aria-label="Role"
          value={role}
          onChange={(event) => setRole(event.target.value as Role)}
          className="rounded border border-gray-300 px-3 py-2"
        >
          <option value="teacher">Teacher</option>
          <option value="admin">Admin</option>
          <option value="accountant">Accountant</option>
        </select>
        {role === "teacher" && (
          <>
            <select
              aria-label="Assign class"
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
              className="rounded border border-gray-300 px-3 py-2"
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
              className="rounded border border-gray-300 px-3 py-2"
              placeholder="Subject (required if assigning a class)"
            />
          </>
        )}
        <button type="button" onClick={handleCreate} className="rounded bg-blue-600 px-3 py-2 text-white">
          Create Staff
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr>
            <th className="border-b border-gray-200 pb-2">Name</th>
            <th className="border-b border-gray-200 pb-2">Phone</th>
            <th className="border-b border-gray-200 pb-2">Role</th>
            <th className="border-b border-gray-200 pb-2">Class Assignment</th>
            <th className="border-b border-gray-200 pb-2">Status</th>
            <th className="border-b border-gray-200 pb-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((member) => (
            <Fragment key={member.id}>
              <tr>
                <td className="border-b border-gray-100 py-2">{member.name}</td>
                <td className="border-b border-gray-100 py-2">{member.phone}</td>
                <td className="border-b border-gray-100 py-2">{member.role}</td>
                <td className="border-b border-gray-100 py-2">
                  {member.classAssignment
                    ? `${member.classAssignment.className} ${member.classAssignment.section} (${member.classAssignment.subject})`
                    : "None"}
                </td>
                <td className="border-b border-gray-100 py-2">
                  {member.status === "inactive" && (
                    <span className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-600">Inactive</span>
                  )}
                </td>
                <td className="border-b border-gray-100 py-2">
                  {member.id === currentUserId ? (
                    <span className="text-gray-400">Self</span>
                  ) : (
                    <>
                      <button type="button" onClick={() => startEdit(member)} className="mr-3 text-blue-600 underline">
                        Edit
                      </button>
                      <button type="button" onClick={() => handleDelete(member.id)} className="mr-3 text-red-600 underline">
                        Delete
                      </button>
                      {member.status === "inactive" && (
                        <button
                          type="button"
                          onClick={() => handleActivate(member.id)}
                          className="text-green-700 underline"
                        >
                          Activate
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
              {editingId === member.id && (
                <tr>
                  <td colSpan={6} className="border-b border-gray-100 bg-gray-50 py-2">
                    <div className="flex flex-wrap items-center gap-2 px-2">
                      <input
                        type="text"
                        aria-label={`Edit name for ${member.name}`}
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        className="rounded border border-gray-300 px-2 py-1"
                      />
                      <input
                        type="tel"
                        aria-label={`Edit phone for ${member.name}`}
                        value={editPhone}
                        onChange={(event) => setEditPhone(event.target.value)}
                        className="rounded border border-gray-300 px-2 py-1"
                      />
                      <select
                        aria-label={`Edit role for ${member.name}`}
                        value={editRole}
                        onChange={(event) => setEditRole(event.target.value as Role)}
                        className="rounded border border-gray-300 px-2 py-1"
                      >
                        <option value="teacher">Teacher</option>
                        <option value="admin">Admin</option>
                        <option value="accountant">Accountant</option>
                      </select>
                      {editRole === "teacher" && (
                        <>
                          <select
                            aria-label={`Edit class for ${member.name}`}
                            value={editClassId}
                            onChange={(event) => setEditClassId(event.target.value)}
                            className="rounded border border-gray-300 px-2 py-1"
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
                            aria-label={`Edit subject for ${member.name}`}
                            value={editSubject}
                            onChange={(event) => setEditSubject(event.target.value)}
                            className="rounded border border-gray-300 px-2 py-1"
                            placeholder="Subject"
                          />
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(member.id)}
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
              {deleteBlockedId === member.id && (
                <tr>
                  <td colSpan={6} className="border-b border-gray-100 bg-amber-50 py-2">
                    <div className="flex flex-wrap items-center gap-2 px-2 text-sm">
                      <span>{member.name} has recorded activity and cannot be permanently deleted.</span>
                      <button
                        type="button"
                        onClick={() => handleDeactivate(member.id)}
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
