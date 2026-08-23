"use client";

export interface StudentRow {
  id: number;
  name: string;
  dob: string;
  admissionNo: string;
  rollNumber: string | null;
  photoUrl: string | null;
  status: "active" | "left" | "transferred" | "graduated" | "inactive";
  gender: "male" | "female" | "other" | null;
  studentIdNumber: string | null;
  dateOfJoin: string | null;
  address?: string | null;
  bloodGroup?: string | null;
  nationality?: string | null;
  religion?: string | null;
  previousSchool?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  category?: string | null;
  admissionDate?: string | null;
  class: { gradeName: string; section: string } | null;
  parents: { relationship: string; name: string; phone: string; email: string | null }[];
  siblings: {
    id: number;
    name: string;
    admissionNo: string;
    gender: "male" | "female" | "other" | null;
    class: { gradeName: string; section: string } | null;
  }[];
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function StudentCard({ student, onClick }: { student: StudentRow; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`View details for ${student.name}`}
      className="flex flex-col items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-4 text-center transition-all hover:border-neutral-300 hover:shadow-sm"
    >
      {student.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={student.photoUrl} alt={student.name} className="h-14 w-14 rounded-full object-cover" />
      ) : (
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-200 text-sm font-bold text-neutral-600">
          {initials(student.name)}
        </span>
      )}
      <span className="text-xs font-semibold text-neutral-800">{student.name}</span>
      {student.rollNumber && <span className="text-[11px] text-neutral-400">Roll No. {student.rollNumber}</span>}
      <span className="text-[11px] text-neutral-400">
        {student.class ? `${student.class.gradeName} ${student.class.section}` : "Unassigned"}
      </span>
      {student.status !== "active" && (
        <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-bold text-neutral-600">
          {student.status}
        </span>
      )}
    </button>
  );
}
