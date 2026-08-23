"use client";

import { useState } from "react";

interface AcademicYearOption {
  id: number;
  name: string;
  status: "upcoming" | "active" | "archived";
}

interface RosterStudent {
  studentId: number;
  name: string;
  action: "promoted" | "retained" | "graduated" | "transferred" | "left" | "inactive" | null;
  toClassId: number | null;
}

interface RosterClassGroup {
  fromClassId: number;
  toClassId: number | null;
  students: RosterStudent[];
}

const ACTIONS: NonNullable<RosterStudent["action"]>[] = [
  "promoted",
  "retained",
  "graduated",
  "transferred",
  "left",
  "inactive",
];

interface RolloverOptions {
  classes: boolean;
  faculty: boolean;
  timetable: boolean;
  feeStructures: boolean;
}

interface RolloverSummary {
  classes: number;
  faculty: { cloned: number; skippedInactive: number };
  timetable: { cloned: number; skippedNoTeacher: number };
  feeStructures: number;
}

function formatRolloverSummary(summary: RolloverSummary): string {
  const parts = [
    `${summary.classes} classes`,
    summary.faculty.skippedInactive > 0
      ? `${summary.faculty.cloned} faculty assignments (${summary.faculty.skippedInactive} skipped: teacher inactive)`
      : `${summary.faculty.cloned} faculty assignments`,
    summary.timetable.skippedNoTeacher > 0
      ? `${summary.timetable.cloned} timetable entries (${summary.timetable.skippedNoTeacher} unstaffed)`
      : `${summary.timetable.cloned} timetable entries`,
    `${summary.feeStructures} fee structures`,
  ];
  return parts.join(", ");
}

export function PromotionWizard({
  upcomingYears,
  classes,
}: {
  upcomingYears: AcademicYearOption[];
  classes: { id: number; gradeName: string; section: string }[];
}) {
  const [toAcademicYearId, setToAcademicYearId] = useState(
    upcomingYears[0] ? String(upcomingYears[0].id) : ""
  );
  const [runId, setRunId] = useState<number | null>(null);
  const [mappings, setMappings] = useState<Record<number, string>>({});
  const [roster, setRoster] = useState<RosterClassGroup[]>([]);
  const [summary, setSummary] = useState<{
    counts: Record<string, number>;
    undecidedStudentIds: number[];
  } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rollover, setRollover] = useState<RolloverOptions>({
    classes: true,
    faculty: true,
    timetable: true,
    feeStructures: true,
  });
  const [rolloverSummary, setRolloverSummary] = useState<RolloverSummary | null>(null);

  function handleRolloverChange(key: keyof RolloverOptions, value: boolean) {
    setRollover((prev) => {
      if (key === "classes" && !value) {
        return { classes: false, faculty: false, timetable: false, feeStructures: false };
      }
      return { ...prev, [key]: value };
    });
  }

  function classLabel(classId: number) {
    const klass = classes.find((c) => c.id === classId);
    return klass ? `${klass.gradeName} ${klass.section}` : String(classId);
  }

  async function handleStart() {
    setError(null);
    const response = await fetch("/api/promotion-runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ toAcademicYearId: Number(toAcademicYearId) }),
    });
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    const body = await response.json();
    setRunId(body.id);
    const initialMappings: Record<number, string> = {};
    for (const mapping of body.mappings) {
      initialMappings[mapping.fromClassId] = mapping.toClassId ? String(mapping.toClassId) : "";
    }
    setMappings(initialMappings);
  }

  async function handleLoadRoster() {
    if (!runId) return;
    const response = await fetch(`/api/promotion-runs/${runId}/roster`);
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    const body = await response.json();
    setRoster(body.classes);
  }

  async function handleSaveMappings() {
    if (!runId) return;
    setError(null);
    const response = await fetch(`/api/promotion-runs/${runId}/mappings`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mappings: Object.entries(mappings).map(([fromClassId, toClassId]) => ({
          fromClassId: Number(fromClassId),
          toClassId: toClassId ? Number(toClassId) : null,
        })),
      }),
    });
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    await handleLoadRoster();
  }

  async function handleSetAction(studentId: number, action: RosterStudent["action"]) {
    if (!runId || !action) return;
    setError(null);
    const response = await fetch(`/api/promotion-runs/${runId}/decisions`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decisions: [{ studentId, action }] }),
    });
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    await handleLoadRoster();
  }

  async function handleLoadSummary() {
    if (!runId) return;
    const response = await fetch(`/api/promotion-runs/${runId}/summary`);
    const body = await response.json();
    setSummary(body);
  }

  async function handleConfirm() {
    if (!runId) return;
    setError(null);
    const response = await fetch(`/api/promotion-runs/${runId}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rollover }),
    });
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    const body = await response.json();
    if (body.rollover) {
      setRolloverSummary(body.rollover);
    }
    setConfirmed(true);
  }

  async function handleUndo() {
    if (!runId) return;
    setError(null);
    const response = await fetch(`/api/promotion-runs/${runId}/revert`, { method: "POST" });
    if (!response.ok) {
      setError((await response.json()).error);
      return;
    }
    setConfirmed(false);
  }

  return (
    <div className="mt-4 space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!runId && (
        <div className="flex items-center gap-2">
          <select
            aria-label="New academic year"
            value={toAcademicYearId}
            onChange={(event) => setToAcademicYearId(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
          >
            {upcomingYears.map((year) => (
              <option key={year.id} value={year.id}>
                {year.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={handleStart} className="rounded bg-blue-600 px-3 py-1 text-white">
            Start Promotion
          </button>
        </div>
      )}

      {runId && !confirmed && (
        <>
          <section>
            <h2 className="font-semibold text-gray-800">1. Map classes</h2>
            {Object.keys(mappings).map((fromClassId) => (
              <div key={fromClassId} className="flex items-center gap-2 py-1">
                <span>{classLabel(Number(fromClassId))} to</span>
                <select
                  aria-label={`Target class for ${classLabel(Number(fromClassId))}`}
                  value={mappings[Number(fromClassId)]}
                  onChange={(event) =>
                    setMappings((prev) => ({ ...prev, [Number(fromClassId)]: event.target.value }))
                  }
                  className="rounded border border-gray-300 px-2 py-1"
                >
                  <option value="">No mapping, review individually</option>
                  {classes.map((klass) => (
                    <option key={klass.id} value={klass.id}>
                      {klass.gradeName} {klass.section}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <button type="button" onClick={handleSaveMappings} className="mt-2 rounded bg-blue-600 px-3 py-1 text-white">
              Save Mappings and Load Roster
            </button>
          </section>

          {roster.length > 0 && (
            <section>
              <h2 className="font-semibold text-gray-800">2. Review students</h2>
              {roster.map((group) => (
                <div key={group.fromClassId} className="mt-2">
                  <h3 className="text-sm font-medium text-gray-600">{classLabel(group.fromClassId)}</h3>
                  <table className="w-full text-left text-sm">
                    <tbody>
                      {group.students.map((student) => (
                        <tr key={student.studentId}>
                          <td className="border-b border-gray-100 py-1">{student.name}</td>
                          <td className="border-b border-gray-100 py-1">
                            <select
                              aria-label={`Decision for ${student.name}`}
                              value={student.action ?? ""}
                              onChange={(event) =>
                                handleSetAction(student.studentId, event.target.value as RosterStudent["action"])
                              }
                              className="rounded border border-gray-300 px-2 py-1"
                            >
                              <option value="">Undecided</option>
                              {ACTIONS.map((action) => (
                                <option key={action} value={action}>
                                  {action}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              <button type="button" onClick={handleLoadSummary} className="mt-2 rounded bg-blue-600 px-3 py-1 text-white">
                Review Summary
              </button>
            </section>
          )}

          {summary && (
            <section>
              <h2 className="font-semibold text-gray-800">3. Summary and confirm</h2>
              <ul className="text-sm">
                {Object.entries(summary.counts).map(([action, count]) => (
                  <li key={action}>
                    {action}: {count}
                  </li>
                ))}
              </ul>
              {summary.undecidedStudentIds.length > 0 ? (
                <p className="text-sm text-red-600">
                  {summary.undecidedStudentIds.length} student(s) still need a decision.
                </p>
              ) : (
                <>
                  <fieldset className="mt-3 space-y-1">
                    <legend className="text-sm font-medium text-gray-700">
                      Also set up the new year
                    </legend>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={rollover.classes}
                        onChange={(event) => handleRolloverChange("classes", event.target.checked)}
                      />
                      Classes
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={rollover.faculty}
                        disabled={!rollover.classes}
                        onChange={(event) => handleRolloverChange("faculty", event.target.checked)}
                      />
                      Faculty assignments
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={rollover.timetable}
                        disabled={!rollover.classes}
                        onChange={(event) => handleRolloverChange("timetable", event.target.checked)}
                      />
                      Timetable
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={rollover.feeStructures}
                        disabled={!rollover.classes}
                        onChange={(event) => handleRolloverChange("feeStructures", event.target.checked)}
                      />
                      Fee structures
                    </label>
                  </fieldset>
                  <button type="button" onClick={handleConfirm} className="mt-2 rounded bg-green-700 px-3 py-1 text-white">
                    Confirm Promotion
                  </button>
                </>
              )}
            </section>
          )}
        </>
      )}

      {confirmed && (
        <div>
          <p className="text-sm text-green-700">Promotion complete.</p>
          {rolloverSummary && (
            <p className="mt-1 text-sm text-gray-600">{formatRolloverSummary(rolloverSummary)}</p>
          )}
          <button type="button" onClick={handleUndo} className="mt-2 rounded bg-red-600 px-3 py-1 text-white">
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
