"use client";

import { useMemo, useState } from "react";
import { StudentCard, type StudentRow } from "./StudentCard";
import { StudentDetailModal, type SaveStudentFields } from "./StudentDetailModal";
import { GridToolbar } from "./GridToolbar";
import { Pagination } from "./Pagination";
import { useSubmitGuard } from "../../hooks/useSubmitGuard";

type ModalState = { mode: "create" } | { mode: "edit"; id: number } | null;

const PAGE_SIZE = 8;

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
  classes: { id: number; gradeName: string; section: string }[];
  isAdmin: boolean;
}) {
  const [students, setStudents] = useState(initialStudents);
  const [classFilter, setClassFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  const [modalState, setModalState] = useState<ModalState>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteBlockedId, setDeleteBlockedId] = useState<number | null>(null);
  const { isSubmitting, run } = useSubmitGuard();

  const selectedClass = classFilter === "all" ? null : classes.find((klass) => String(klass.id) === classFilter);
  const classFilteredStudents =
    classFilter === "all"
      ? students
      : students.filter((student) => selectedClass && student.classId === selectedClass.id);

  const filteredStudents = useMemo(() => {
    const term = search.toLowerCase();
    if (!term) return classFilteredStudents;
    return classFilteredStudents.filter(
      (student) =>
        student.name.toLowerCase().includes(term) || student.admissionNo.toLowerCase().includes(term)
    );
  }, [classFilteredStudents, search]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStudents = filteredStudents.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function handleClassFilterChange(value: string) {
    setClassFilter(value);
    setPage(1);
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

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
            address: fields.address || undefined,
            bloodGroup: fields.bloodGroup || undefined,
            nationality: fields.nationality || undefined,
            religion: fields.religion || undefined,
            previousSchool: fields.previousSchool || undefined,
            emergencyContactName: fields.emergencyContactName || undefined,
            emergencyContactPhone: fields.emergencyContactPhone || undefined,
            category: fields.category || undefined,
            admissionDate: fields.admissionDate || undefined,
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
          gender?: "male" | "female" | "other";
          studentIdNumber?: string;
          dateOfJoin?: string;
          address?: string;
          bloodGroup?: string;
          nationality?: string;
          religion?: string;
          previousSchool?: string;
          emergencyContactName?: string;
          emergencyContactPhone?: string;
          category?: string;
          admissionDate?: string;
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
        if (fields.address) body.address = fields.address;
        if (fields.bloodGroup) body.bloodGroup = fields.bloodGroup;
        if (fields.nationality) body.nationality = fields.nationality;
        if (fields.religion) body.religion = fields.religion;
        if (fields.previousSchool) body.previousSchool = fields.previousSchool;
        if (fields.emergencyContactName) body.emergencyContactName = fields.emergencyContactName;
        if (fields.emergencyContactPhone) body.emergencyContactPhone = fields.emergencyContactPhone;
        if (fields.category) body.category = fields.category;
        if (fields.admissionDate) body.admissionDate = fields.admissionDate;
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
    });
  }

  async function handleDelete() {
    if (modalState?.mode !== "edit") return;
    setError(null);
    await run(async () => {
      if (modalState.mode !== "edit") return;
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
    });
  }

  async function handleDeactivate() {
    if (modalState?.mode !== "edit") return;
    setError(null);
    await run(async () => {
      if (modalState.mode !== "edit") return;
      const response = await fetch(`/api/students/${modalState.id}/deactivate`, { method: "PATCH" });
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
      const response = await fetch(`/api/students/${modalState.id}/activate`, { method: "PATCH" });
      if (!response.ok) {
        setError((await response.json()).error);
        return;
      }
      await refresh();
    });
  }

  const editingStudent =
    modalState?.mode === "edit" ? students.find((student) => student.id === modalState.id) : undefined;

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <select
          aria-label="Filter by class"
          value={classFilter}
          onChange={(event) => handleClassFilterChange(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="all">All classes</option>
          {classes.map((klass) => (
            <option key={klass.id} value={klass.id}>
              {klass.gradeName} {klass.section}
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

      <div className="mt-4">
        <GridToolbar
          searchValue={search}
          onSearchChange={handleSearchChange}
          searchLabel="Search students..."
          view={view}
          onViewChange={setView}
        />
      </div>

      {pageStudents.length === 0 && (
        <p className="py-8 text-center text-sm text-neutral-400">No students found</p>
      )}

      {pageStudents.length > 0 && view === "grid" && (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {pageStudents.map((student) => (
            <StudentCard key={student.id} student={student} onClick={() => openEdit(student.id)} />
          ))}
        </div>
      )}

      {pageStudents.length > 0 && view === "list" && (
        <table className="mt-6 w-full text-left text-sm">
          <thead>
            <tr>
              <th className="border-b border-gray-200 pb-2">Name</th>
              <th className="border-b border-gray-200 pb-2">Class</th>
              <th className="border-b border-gray-200 pb-2">Admission No.</th>
              <th className="border-b border-gray-200 pb-2">Status</th>
              <th className="border-b border-gray-200 pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageStudents.map((student) => (
              <tr key={student.id}>
                <td className="border-b border-gray-100 py-2">{student.name}</td>
                <td className="border-b border-gray-100 py-2">
                  {student.class ? `${student.class.gradeName} ${student.class.section}` : "Unassigned"}
                </td>
                <td className="border-b border-gray-100 py-2">{student.admissionNo}</td>
                <td className="border-b border-gray-100 py-2">
                  {student.status !== "active" && (
                    <span className="rounded bg-gray-200 px-2 py-0.5 text-xs capitalize text-gray-600">
                      {student.status}
                    </span>
                  )}
                </td>
                <td className="border-b border-gray-100 py-2">
                  <button
                    type="button"
                    onClick={() => openEdit(student.id)}
                    className="text-blue-600 underline"
                  >
                    {isAdmin ? "Edit" : "View"}
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
          total={filteredStudents.length}
          onPageChange={setPage}
          itemLabel="students"
        />
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
