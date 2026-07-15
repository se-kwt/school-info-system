"use client";

import { useState } from "react";
import { StaffCard, type StaffRow } from "./StaffCard";
import { StaffDetailModal, type SaveStaffFields } from "./StaffDetailModal";

type Role = "teacher" | "admin" | "accountant";
type ModalState = { mode: "create" } | { mode: "edit"; id: number } | null;

export function StaffView({
  initialStaff,
  classes,
  subjects,
  currentUserId,
}: {
  initialStaff: StaffRow[];
  classes: { id: number; gradeId: number; gradeName: string; section: string }[];
  subjects: { id: number; name: string; gradeId: number }[];
  currentUserId: number;
}) {
  const [staff, setStaff] = useState(initialStaff);
  const [roleFilter, setRoleFilter] = useState<"all" | Role>("all");
  const [modalState, setModalState] = useState<ModalState>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteBlockedId, setDeleteBlockedId] = useState<number | null>(null);

  const filteredStaff = roleFilter === "all" ? staff : staff.filter((member) => member.role === roleFilter);

  async function refresh() {
    const response = await fetch("/api/staff");
    setStaff(await response.json());
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

  async function handleSave(fields: SaveStaffFields) {
    setError(null);
    if (modalState?.mode === "create") {
      const response = await fetch("/api/staff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: fields.name,
          phone: fields.phone,
          role: fields.role,
          classId: fields.classId ?? undefined,
          subjectId: fields.subjectId ?? undefined,
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
      const response = await fetch(`/api/staff/${modalState.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: fields.name,
          phone: fields.phone,
          role: fields.role,
          classId: fields.classId,
          subjectId: fields.subjectId,
        }),
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
    const response = await fetch(`/api/staff/${modalState.id}`, { method: "DELETE" });
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
    const response = await fetch(`/api/staff/${modalState.id}/deactivate`, { method: "PATCH" });
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
    const response = await fetch(`/api/staff/${modalState.id}/activate`, { method: "PATCH" });
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    await refresh();
  }

  const editingStaff = modalState?.mode === "edit" ? staff.find((member) => member.id === modalState.id) : undefined;

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <select
          aria-label="Filter by role"
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value as "all" | Role)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="all">All roles</option>
          <option value="teacher">Teacher</option>
          <option value="admin">Admin</option>
          <option value="accountant">Accountant</option>
        </select>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-black"
        >
          Add new staff
        </button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {filteredStaff.map((member) => (
          <StaffCard key={member.id} member={member} onClick={() => openEdit(member.id)} />
        ))}
      </div>

      {modalState && (
        <StaffDetailModal
          mode={modalState.mode}
          staff={editingStaff}
          classes={classes}
          subjects={subjects}
          isSelf={modalState.mode === "edit" && modalState.id === currentUserId}
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
