"use client";

import { StudentAttendanceCard } from "./StudentAttendanceCard";

export interface ReviewEntry {
  studentId: number;
  name: string;
  rollNumber: string | null;
  photoUrl: string | null;
  status: "present" | "absent" | "late" | null;
}

export function AttendanceReviewPanel({
  entries,
  onCycle,
  onBack,
  onConfirm,
}: {
  entries: ReviewEntry[];
  onCycle: (studentId: number) => void;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div>
          <h2 className="text-sm font-bold text-neutral-800">Review Before Submitting</h2>
          <p className="text-xs text-neutral-400">
            These students are absent, late, or unmarked. Adjust anything before submitting.
          </p>
        </div>

        {entries.length === 0 ? (
          <p className="text-xs text-neutral-500">Every student is marked present.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {entries.map((entry) => (
              <StudentAttendanceCard
                key={entry.studentId}
                name={entry.name}
                rollNumber={entry.rollNumber}
                photoUrl={entry.photoUrl}
                status={entry.status}
                onClick={() => onCycle(entry.studentId)}
              />
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 transition-all hover:bg-neutral-50"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-black"
          >
            Confirm & Submit
          </button>
        </div>
      </div>
    </div>
  );
}
