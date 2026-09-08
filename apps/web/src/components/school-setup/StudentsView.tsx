"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { StudentCard, type StudentRow } from "./StudentCard";
import { StudentDetailModal, type SaveStudentFields } from "./StudentDetailModal";
import { GridToolbar } from "./GridToolbar";
import { Pagination } from "./Pagination";
import { useSubmitGuard } from "../../hooks/useSubmitGuard";

type ModalState = { id: number } | null;

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
  hideClassFilter,
}: {
  initialStudents: StudentRow[];
  classes: { id: number; gradeName: string; section: string }[];
  isAdmin: boolean;
  hideClassFilter?: boolean;
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

  function openEdit(id: number) {
    setModalState({ id });
    setError(null);
    setDeleteBlockedId(null);
  }

  function closeModal() {
    setModalState(null);
    setError(null);
    setDeleteBlockedId(null);
  }

  async function handleSave(fields: SaveStudentFields) {
    if (!modalState) return;
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
    });
  }

  async function handleDelete() {
    if (!modalState) return;
    setError(null);
    await run(async () => {
      if (!modalState) return;
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
    if (!modalState) return;
    setError(null);
    await run(async () => {
      if (!modalState) return;
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
    if (!modalState) return;
    setError(null);
    await run(async () => {
      if (!modalState) return;
      const response = await fetch(`/api/students/${modalState.id}/activate`, { method: "PATCH" });
      if (!response.ok) {
        setError((await response.json()).error);
        return;
      }
      await refresh();
    });
  }

  const editingStudent = modalState ? students.find((student) => student.id === modalState.id) : undefined;

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-3">
        {!hideClassFilter && (
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
        )}
        {isAdmin && (
          <Link
            href="/dashboard/students/add"
            className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-black"
          >
            Add new student
          </Link>
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
          mode="edit"
          student={editingStudent}
          classes={classes}
          allStudents={students}
          isAdmin={isAdmin}
          defaultClassId={selectedClass?.id}
          serverError={error}
          deleteBlocked={deleteBlockedId === modalState.id}
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
