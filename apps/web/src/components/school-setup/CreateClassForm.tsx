"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const inputClass =
  "rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-800 placeholder-neutral-400 focus:border-neutral-400 focus:outline-none";

export function CreateClassForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [section, setSection] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const response = await fetch("/api/classes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, section }),
    });

    if (response.status === 201) {
      setName("");
      setSection("");
      router.refresh();
      return;
    }
    if (response.status === 409) {
      const body = await response.json();
      setError(body.error);
      return;
    }
    setError("Enter a name and section");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
      <input
        type="text"
        aria-label="Class name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className={inputClass}
        placeholder="e.g. Grade 6"
      />
      <input
        type="text"
        aria-label="Section"
        value={section}
        onChange={(event) => setSection(event.target.value)}
        className={inputClass}
        placeholder="e.g. B"
      />
      <button
        type="submit"
        className="rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-black"
      >
        Create Class
      </button>
      {error && <p className="w-full text-xs text-red-500">{error}</p>}
    </form>
  );
}
