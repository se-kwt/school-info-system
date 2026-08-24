"use client";

import { useState } from "react";
import { useSubmitGuard } from "../../hooks/useSubmitGuard";

interface PeriodRow {
  id: number;
  order: number;
  label: string;
  isBreak: boolean;
  startTime: string;
  endTime: string;
  overridesByDay: Record<number, { startTime: string; endTime: string }>;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS = [1, 2, 3, 4, 5, 6];

export function PeriodsView({ initialPeriods }: { initialPeriods: PeriodRow[] }) {
  const [periods, setPeriods] = useState(initialPeriods);
  const [order, setOrder] = useState("");
  const [label, setLabel] = useState("");
  const [isBreak, setIsBreak] = useState(false);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("09:45");
  const [error, setError] = useState<string | null>(null);
  const [overrideDraft, setOverrideDraft] = useState<Record<number, { day: string; startTime: string; endTime: string }>>({});
  const { isSubmitting, run } = useSubmitGuard();

  async function refresh() {
    const response = await fetch("/api/periods");
    setPeriods(await response.json());
  }

  async function handleCreate() {
    setError(null);
    await run(async () => {
      const response = await fetch("/api/periods", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ order: Number(order), label, isBreak, startTime, endTime }),
      });
      if (response.status === 201) {
        setOrder("");
        setLabel("");
        setIsBreak(false);
        await refresh();
        return;
      }
      setError((await response.json()).error);
    });
  }

  async function handleDelete(id: number) {
    setError(null);
    await run(async () => {
      const response = await fetch(`/api/periods/${id}`, { method: "DELETE" });
      if (!response.ok) {
        setError((await response.json()).error);
        return;
      }
      await refresh();
    });
  }

  async function handleSetOverride(periodId: number) {
    setError(null);
    const draft = overrideDraft[periodId];
    if (!draft?.day) return;
    await run(async () => {
      const response = await fetch(`/api/periods/${periodId}/overrides`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dayOfWeek: Number(draft.day), startTime: draft.startTime, endTime: draft.endTime }),
      });
      if (!response.ok) {
        setError((await response.json()).error);
        return;
      }
      await refresh();
    });
  }

  async function handleClearOverride(periodId: number, dayOfWeek: number) {
    setError(null);
    await run(async () => {
      const response = await fetch(`/api/periods/${periodId}/overrides?dayOfWeek=${dayOfWeek}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setError((await response.json()).error);
        return;
      }
      await refresh();
    });
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          aria-label="Order"
          placeholder="Order"
          value={order}
          onChange={(event) => setOrder(event.target.value)}
          className="w-20 rounded border border-gray-300 px-3 py-2"
        />
        <input
          type="text"
          aria-label="Label"
          placeholder="Label (e.g. Period 1)"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        />
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={isBreak} onChange={(event) => setIsBreak(event.target.checked)} />
          Break
        </label>
        <input
          type="time"
          aria-label="Start time"
          value={startTime}
          onChange={(event) => setStartTime(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        />
        <input
          type="time"
          aria-label="End time"
          value={endTime}
          onChange={(event) => setEndTime(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        />
        <button
          type="button"
          onClick={handleCreate}
          disabled={isSubmitting}
          className="rounded bg-blue-600 px-3 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add Period
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-6 flex flex-col gap-4">
        {periods.map((period) => (
          <div key={period.id} className="rounded border border-gray-200 p-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-800">
                {period.order}. {period.label} {period.isBreak && "(Break)"} — {period.startTime}–{period.endTime}
              </span>
              <button
                type="button"
                onClick={() => handleDelete(period.id)}
                disabled={isSubmitting}
                className="text-sm text-red-600 underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                Delete
              </button>
            </div>

            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {DAYS.map((day) => {
                const override = period.overridesByDay[day];
                return override ? (
                  <span key={day} className="rounded bg-amber-100 px-2 py-1 text-amber-700">
                    {DAY_NAMES[day]}: {override.startTime}–{override.endTime}
                    <button
                      type="button"
                      onClick={() => handleClearOverride(period.id, day)}
                      disabled={isSubmitting}
                      className="ml-1 underline disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Clear
                    </button>
                  </span>
                ) : null;
              })}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                aria-label={`Override day for ${period.label}`}
                value={overrideDraft[period.id]?.day ?? ""}
                onChange={(event) =>
                  setOverrideDraft((prev) => ({
                    ...prev,
                    [period.id]: { day: event.target.value, startTime: prev[period.id]?.startTime ?? period.startTime, endTime: prev[period.id]?.endTime ?? period.endTime },
                  }))
                }
                className="rounded border border-gray-300 px-2 py-1 text-xs"
              >
                <option value="">Override day…</option>
                {DAYS.map((day) => (
                  <option key={day} value={day}>
                    {DAY_NAMES[day]}
                  </option>
                ))}
              </select>
              <input
                type="time"
                aria-label={`Override start time for ${period.label}`}
                value={overrideDraft[period.id]?.startTime ?? period.startTime}
                onChange={(event) =>
                  setOverrideDraft((prev) => ({
                    ...prev,
                    [period.id]: { day: prev[period.id]?.day ?? "", startTime: event.target.value, endTime: prev[period.id]?.endTime ?? period.endTime },
                  }))
                }
                className="rounded border border-gray-300 px-2 py-1 text-xs"
              />
              <input
                type="time"
                aria-label={`Override end time for ${period.label}`}
                value={overrideDraft[period.id]?.endTime ?? period.endTime}
                onChange={(event) =>
                  setOverrideDraft((prev) => ({
                    ...prev,
                    [period.id]: { day: prev[period.id]?.day ?? "", startTime: prev[period.id]?.startTime ?? period.startTime, endTime: event.target.value },
                  }))
                }
                className="rounded border border-gray-300 px-2 py-1 text-xs"
              />
              <button
                type="button"
                onClick={() => handleSetOverride(period.id)}
                disabled={isSubmitting}
                className="rounded bg-neutral-900 px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Set override
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
