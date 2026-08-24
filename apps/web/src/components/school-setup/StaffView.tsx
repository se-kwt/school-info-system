"use client";

import { useMemo, useState } from "react";
import { StaffCard, type StaffRow } from "./StaffCard";
import { StaffDetailModal, type SaveStaffFields } from "./StaffDetailModal";
import { GridToolbar } from "./GridToolbar";
import { Pagination } from "./Pagination";
import { useSubmitGuard } from "../../hooks/useSubmitGuard";

type Role = "teacher" | "admin" | "accountant";
type ModalState = { mode: "create" } | { mode: "edit"; id: number } | null;

const PAGE_SIZE = 8;

async function uploadPhoto(file: File): Promise<{ ok: true; photoUrl: string } | { ok: false; error: string }> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch("/api/staff/upload-photo", { method: "POST", body: formData });
  if (!response.ok) {
    const body = await response.json();
    return { ok: false, error: body.error };
  }
  const body = await response.json();
  return { ok: true, photoUrl: body.photoUrl };
}

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
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  const [modalState, setModalState] = useState<ModalState>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteBlockedId, setDeleteBlockedId] = useState<number | null>(null);
  const { isSubmitting, run } = useSubmitGuard();

  const roleFilteredStaff = roleFilter === "all" ? staff : staff.filter((member) => member.role === roleFilter);

  const filteredStaff = useMemo(() => {
    const term = search.toLowerCase();
    if (!term) return roleFilteredStaff;
    return roleFilteredStaff.filter(
      (member) => member.name.toLowerCase().includes(term) || member.phone.toLowerCase().includes(term)
    );
  }, [roleFilteredStaff, search]);

  const totalPages = Math.max(1, Math.ceil(filteredStaff.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStaff = filteredStaff.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function handleRoleFilterChange(value: "all" | Role) {
    setRoleFilter(value);
    setPage(1);
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

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

    await run(async () => {
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
        const response = await fetch("/api/staff", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: fields.name,
            phone: fields.phone,
            role: fields.role,
            classId: fields.classId ?? undefined,
            subjectId: fields.subjectId ?? undefined,
            email: fields.email || undefined,
            qualification: fields.qualification || undefined,
            designation: fields.designation || undefined,
            joiningDate: fields.joiningDate || undefined,
            salary: fields.salary !== "" ? Number(fields.salary) : undefined,
            address: fields.address || undefined,
            photoUrl,
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
          phone: string;
          role: Role;
          classId: number | null;
          subjectId: number | null;
          email?: string;
          qualification?: string;
          designation?: string;
          joiningDate?: string;
          salary?: number;
          address?: string;
          photoUrl?: string;
        } = {
          name: fields.name,
          phone: fields.phone,
          role: fields.role,
          classId: fields.classId,
          subjectId: fields.subjectId,
        };
        if (fields.email) body.email = fields.email;
        if (fields.qualification) body.qualification = fields.qualification;
        if (fields.designation) body.designation = fields.designation;
        if (fields.joiningDate) body.joiningDate = fields.joiningDate;
        if (fields.salary !== "") body.salary = Number(fields.salary);
        if (fields.address) body.address = fields.address;
        if (photoUrl) body.photoUrl = photoUrl;

        const response = await fetch(`/api/staff/${modalState.id}`, {
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
    });
  }

  async function handleDelete() {
    if (modalState?.mode !== "edit") return;
    setError(null);
    await run(async () => {
      if (modalState.mode !== "edit") return;
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
    });
  }

  async function handleDeactivate() {
    if (modalState?.mode !== "edit") return;
    setError(null);
    await run(async () => {
      if (modalState.mode !== "edit") return;
      const response = await fetch(`/api/staff/${modalState.id}/deactivate`, { method: "PATCH" });
      if (!response.ok) {
        setError((await response.json()).error);
        return;
      }
      await refresh();
      closeModal();
    });
  }

  async function handleActivate() {
    if (modalState?.mode !== "edit") return;
    setError(null);
    await run(async () => {
      if (modalState.mode !== "edit") return;
      const response = await fetch(`/api/staff/${modalState.id}/activate`, { method: "PATCH" });
      if (!response.ok) {
        setError((await response.json()).error);
        return;
      }
      await refresh();
    });
  }

  const editingStaff = modalState?.mode === "edit" ? staff.find((member) => member.id === modalState.id) : undefined;

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <select
          aria-label="Filter by role"
          value={roleFilter}
          onChange={(event) => handleRoleFilterChange(event.target.value as "all" | Role)}
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

      <div className="mt-4">
        <GridToolbar
          searchValue={search}
          onSearchChange={handleSearchChange}
          searchLabel="Search staff..."
          view={view}
          onViewChange={setView}
        />
      </div>

      {pageStaff.length === 0 && <p className="py-8 text-center text-sm text-neutral-400">No staff found</p>}

      {pageStaff.length > 0 && view === "grid" && (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {pageStaff.map((member) => (
            <StaffCard key={member.id} member={member} onClick={() => openEdit(member.id)} />
          ))}
        </div>
      )}

      {pageStaff.length > 0 && view === "list" && (
        <table className="mt-6 w-full text-left text-sm">
          <thead>
            <tr>
              <th className="border-b border-gray-200 pb-2">Name</th>
              <th className="border-b border-gray-200 pb-2">Phone</th>
              <th className="border-b border-gray-200 pb-2">Role</th>
              <th className="border-b border-gray-200 pb-2">Status</th>
              <th className="border-b border-gray-200 pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageStaff.map((member) => (
              <tr key={member.id}>
                <td className="border-b border-gray-100 py-2">{member.name}</td>
                <td className="border-b border-gray-100 py-2">{member.phone}</td>
                <td className="border-b border-gray-100 py-2 capitalize">{member.role}</td>
                <td className="border-b border-gray-100 py-2">
                  {member.status === "inactive" && (
                    <span className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-600">Inactive</span>
                  )}
                </td>
                <td className="border-b border-gray-100 py-2">
                  <button type="button" onClick={() => openEdit(member.id)} className="text-blue-600 underline">
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-4">
        <Pagination
          page={currentPage}
          pageSize={PAGE_SIZE}
          total={filteredStaff.length}
          onPageChange={setPage}
          itemLabel="staff"
        />
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
          isSubmitting={isSubmitting}
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
