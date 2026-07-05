"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type Role = "teacher" | "admin" | "accountant";

export function CreateStaffForm({
  classes,
}: {
  classes: { id: number; name: string; section: string }[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("teacher");
  const [classId, setClassId] = useState("");
  const [subject, setSubject] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const response = await fetch("/api/staff", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        phone,
        role,
        classId: role === "teacher" && classId ? Number(classId) : undefined,
        subject: role === "teacher" && subject ? subject : undefined,
      }),
    });

    if (response.status === 201) {
      setName("");
      setPhone("");
      setClassId("");
      setSubject("");
      router.refresh();
      return;
    }
    if (response.status === 409) {
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
        aria-label="Staff name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className="rounded border border-gray-300 px-3 py-2"
        placeholder="Name"
      />
      <input
        type="tel"
        aria-label="Staff phone"
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        className="rounded border border-gray-300 px-3 py-2"
        placeholder="Phone number"
      />
      <select
        aria-label="Role"
        value={role}
        onChange={(event) => setRole(event.target.value as Role)}
        className="rounded border border-gray-300 px-3 py-2"
      >
        <option value="teacher">Teacher</option>
        <option value="admin">Admin</option>
        <option value="accountant">Accountant</option>
      </select>
      {role === "teacher" && (
        <>
          <select
            aria-label="Assign class"
            value={classId}
            onChange={(event) => setClassId(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
          >
            <option value="">No class assignment</option>
            {classes.map((klass) => (
              <option key={klass.id} value={klass.id}>
                {klass.name} {klass.section}
              </option>
            ))}
          </select>
          <input
            type="text"
            aria-label="Subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
            placeholder="Subject (required if assigning a class)"
          />
        </>
      )}
      <button type="submit" className="rounded bg-blue-600 px-3 py-2 text-white">
        Create Staff
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
