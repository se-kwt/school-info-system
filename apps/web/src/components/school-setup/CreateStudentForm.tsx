"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

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
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2">
      <input
        type="text"
        aria-label="Student name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className="rounded border border-gray-300 px-3 py-2"
        placeholder="Student name"
      />
      <input
        type="date"
        aria-label="Date of birth"
        value={dob}
        onChange={(event) => setDob(event.target.value)}
        className="rounded border border-gray-300 px-3 py-2"
      />
      <select
        aria-label="Class"
        value={classId}
        onChange={(event) => setClassId(event.target.value)}
        className="rounded border border-gray-300 px-3 py-2"
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
        className="rounded border border-gray-300 px-3 py-2"
        placeholder="Admission number"
      />
      <input
        type="tel"
        aria-label="Parent phone"
        value={parentPhone}
        onChange={(event) => setParentPhone(event.target.value)}
        className="rounded border border-gray-300 px-3 py-2"
        placeholder="Parent phone number"
      />
      <input
        type="text"
        aria-label="Parent name"
        value={parentName}
        onChange={(event) => setParentName(event.target.value)}
        className="rounded border border-gray-300 px-3 py-2"
        placeholder="Parent name (only if this phone is new)"
      />
      <button type="submit" className="rounded bg-blue-600 px-3 py-2 text-white">
        Create Student
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
