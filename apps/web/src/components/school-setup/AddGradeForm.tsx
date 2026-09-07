"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Layers } from "lucide-react";
import { PageHeader } from "./PageHeader";
import { useSubmitGuard } from "../../hooks/useSubmitGuard";

export function AddGradeForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { isSubmitting, run } = useSubmitGuard();

  async function handleSave() {
    setError(null);
    await run(async () => {
      const response = await fetch("/api/grades", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (response.status === 201) {
        router.push("/dashboard/grades");
        return;
      }
      setError((await response.json()).error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader icon={Layers} title="Add Grade" subtitle="Create a new grade level for your school" />
      <div className="flex max-w-sm flex-col gap-2 rounded-2xl border border-neutral-200/60 bg-white p-6 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]">
        <input
          type="text"
          aria-label="Grade name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="e.g. Grade 1"
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
