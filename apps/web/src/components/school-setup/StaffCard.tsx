"use client";

type Role = "teacher" | "admin" | "accountant";

export interface StaffRow {
  id: number;
  name: string;
  phone: string;
  role: Role;
  status: "active" | "inactive";
  classAssignment: { gradeName: string; section: string; subjectName: string } | null;
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function StaffCard({ member, onClick }: { member: StaffRow; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`View details for ${member.name}`}
      className="flex flex-col items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-4 text-center transition-all hover:border-neutral-300 hover:shadow-sm"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-200 text-sm font-bold text-neutral-600">
        {initials(member.name)}
      </span>
      <span className="text-xs font-semibold text-neutral-800">{member.name}</span>
      <span className="text-[11px] capitalize text-neutral-400">{member.role}</span>
      {member.role === "teacher" && member.classAssignment && (
        <span className="text-[11px] text-neutral-400">
          {member.classAssignment.gradeName} {member.classAssignment.section} · {member.classAssignment.subjectName}
        </span>
      )}
      {member.status === "inactive" && (
        <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-bold text-neutral-600">
          Inactive
        </span>
      )}
    </button>
  );
}
