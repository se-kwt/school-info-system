"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { PageHeader } from "./PageHeader";
import { useSubmitGuard } from "../../hooks/useSubmitGuard";

interface GradeOption {
  id: number;
  name: string;
}

interface AcademicYearOption {
  id: number;
  name: string;
}

export function AddClassForm({
  grades,
  academicYears,
}: {
  grades: GradeOption[];
  academicYears: AcademicYearOption[];
}) {
  const router = useRouter();
  const [gradeId, setGradeId] = useState(grades[0] ? String(grades[0].id) : "");
  const [section, setSection] = useState("");
  const [academicYearId, setAcademicYearId] = useState(academicYears[0] ? String(academicYears[0].id) : "");
  const [capacity, setCapacity] = useState("");
  const [room, setRoom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { isSubmitting, run } = useSubmitGuard();

  async function handleSave() {
    setError(null);

    if (!section.trim()) {
      setError("Section is required");
      return;
    }
    if (capacity && Number(capacity) <= 0) {
      setError("Capacity must be greater than 0");
      return;
    }

    await run(async () => {
      const response = await fetch("/api/classes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          gradeId: Number(gradeId),
          section,
          academicYearId: Number(academicYearId),
          capacity: capacity ? Number(capacity) : undefined,
          room: room || undefined,
        }),
      });
      if (response.status === 201) {
        router.push("/dashboard/classes");
        return;
      }
      setError((await response.json()).error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader icon={Building2} title="Add Class" subtitle="Create a new class for your school" />
      <div className="flex max-w-sm flex-col gap-2 rounded-2xl border border-neutral-200/60 bg-white p-6 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]">
        <select
          aria-label="Grade"
          value={gradeId}
          onChange={(event) => setGradeId(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          {grades.map((grade) => (
            <option key={grade.id} value={grade.id}>
              {grade.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          aria-label="Section"
          value={section}
          onChange={(event) => setSection(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="e.g. B"
        />
        <select
          aria-label="Academic year"
          value={academicYearId}
          onChange={(event) => setAcademicYearId(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          {academicYears.map((year) => (
            <option key={year.id} value={year.id}>
              {year.name}
            </option>
          ))}
        </select>
        <input
          type="number"
          min="1"
          aria-label="Capacity"
          value={capacity}
          onChange={(event) => setCapacity(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="e.g. 40"
        />
        <input
          type="text"
          aria-label="Room"
          value={room}
          onChange={(event) => setRoom(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="e.g. B-204"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSubmitting}
            className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
