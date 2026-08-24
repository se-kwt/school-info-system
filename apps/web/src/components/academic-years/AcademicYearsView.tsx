"use client";

import { useState } from "react";
import { useSubmitGuard } from "../../hooks/useSubmitGuard";

interface AcademicYearRow {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  status: "upcoming" | "active" | "archived";
}

export function AcademicYearsView({ initialYears }: { initialYears: AcademicYearRow[] }) {
  const [years, setYears] = useState(initialYears);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { isSubmitting, run } = useSubmitGuard();

  async function refresh() {
    const response = await fetch("/api/academic-years");
    const body = await response.json();
    setYears(body.academicYears);
  }

  async function handleCreate() {
    setError(null);
    await run(async () => {
      const response = await fetch("/api/academic-years", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, startDate, endDate }),
      });
      if (response.ok) {
        setName("");
        setStartDate("");
        setEndDate("");
        await refresh();
        return;
      }
      const body = await response.json();
      setError(body.error);
    });
  }

  async function handleTransition(id: number, action: "activate" | "archive") {
    setError(null);
    await run(async () => {
      const response = await fetch(`/api/academic-years/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (response.ok) {
        await refresh();
        return;
      }
      const body = await response.json();
      setError(body.error);
    });
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          aria-label="Name"
          placeholder="2026-27"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="rounded border border-gray-300 px-2 py-1"
        />
        <input
          type="date"
          aria-label="Start date"
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          className="rounded border border-gray-300 px-2 py-1"
        />
        <input
          type="date"
          aria-label="End date"
          value={endDate}
          onChange={(event) => setEndDate(event.target.value)}
          className="rounded border border-gray-300 px-2 py-1"
        />
        <button
          type="button"
          onClick={handleCreate}
          disabled={isSubmitting}
          className="rounded bg-blue-600 px-3 py-1 text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Create Academic Year
        </button>
      </div>

      <div className="mt-4">
        <a href="/dashboard/academic-years/promote" className="text-sm text-blue-600 underline">
          Start Academic Year Promotion Wizard
        </a>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr>
            <th className="border-b border-gray-200 pb-2">Name</th>
            <th className="border-b border-gray-200 pb-2">Start</th>
            <th className="border-b border-gray-200 pb-2">End</th>
            <th className="border-b border-gray-200 pb-2">Status</th>
            <th className="border-b border-gray-200 pb-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {years.map((year) => (
            <tr key={year.id}>
              <td className="border-b border-gray-100 py-2">{year.name}</td>
              <td className="border-b border-gray-100 py-2">{year.startDate}</td>
              <td className="border-b border-gray-100 py-2">{year.endDate}</td>
              <td
                className={`border-b border-gray-100 py-2 ${
                  year.status === "active"
                    ? "text-green-600"
                    : year.status === "upcoming"
                      ? "text-amber-600"
                      : "text-gray-500"
                }`}
              >
                {year.status}
              </td>
              <td className="border-b border-gray-100 py-2">
                {year.status === "upcoming" && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleTransition(year.id, "activate")}
                      disabled={isSubmitting}
                      className="rounded bg-blue-600 px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Activate {year.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTransition(year.id, "archive")}
                      disabled={isSubmitting}
                      className="ml-2 rounded border border-gray-300 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Archive {year.name}
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
