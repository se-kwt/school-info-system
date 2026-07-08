"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const inputClass =
  "rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-800 placeholder-neutral-400 focus:border-neutral-400 focus:outline-none";

export function CreateStudentForm({
  classes,
}: {
  classes: { id: number; name: string; section: string }[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [classId, setClassId] = useState(classes[0] ? String(classes[0].id) : "");
  const [admissionNo, setAdmissionNo] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [parentName, setParentName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const response = await fetch("/api/students", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        dob,
        classId: classId ? Number(classId) : undefined,
        admissionNo,
        parentPhone,
        parentName: parentName || undefined,
      }),
    });

    if (response.status === 201) {
      setName("");
      setDob("");
      setAdmissionNo("");
      setParentPhone("");
      setParentName("");
      router.refresh();
      return;
    }
    if (response.status === 409 || response.status === 400) {
      const body = await response.json();
      setError(body.error);
      return;
    }
    setError("Check the required fields");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <input
        type="text"
        aria-label="Student name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className={inputClass}
        placeholder="Student name"
      />
      <input
        type="date"
        aria-label="Date of birth"
        value={dob}
        onChange={(event) => setDob(event.target.value)}
        className={inputClass}
      />
      <select
        aria-label="Class"
        value={classId}
        onChange={(event) => setClassId(event.target.value)}
        className={inputClass}
      >
        {classes.map((klass) => (
          <option key={klass.id} value={klass.id}>
            {klass.name} {klass.section}
          </option>
        ))}
      </select>
      <input
        type="text"
        aria-label="Admission number"
        value={admissionNo}
        onChange={(event) => setAdmissionNo(event.target.value)}
        className={inputClass}
        placeholder="Admission number"
      />
      <input
        type="tel"
        aria-label="Parent phone"
        value={parentPhone}
        onChange={(event) => setParentPhone(event.target.value)}
        className={inputClass}
        placeholder="Parent phone number"
      />
      <input
        type="text"
        aria-label="Parent name"
        value={parentName}
        onChange={(event) => setParentName(event.target.value)}
        className={inputClass}
        placeholder="Parent name (only if this phone is new)"
      />
      <button
        type="submit"
        className="rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-black"
      >
        Create Student
      </button>
      {error && <p className="w-full text-xs text-red-500">{error}</p>}
    </form>
  );
}
