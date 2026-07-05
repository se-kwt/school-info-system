"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

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
    <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
      <input
        type="text"
        aria-label="Class name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className="rounded border border-gray-300 px-3 py-2"
        placeholder="e.g. Grade 6"
      />
      <input
        type="text"
        aria-label="Section"
        value={section}
        onChange={(event) => setSection(event.target.value)}
        className="rounded border border-gray-300 px-3 py-2"
        placeholder="e.g. B"
      />
      <button type="submit" className="rounded bg-blue-600 px-3 py-2 text-white">
        Create Class
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
