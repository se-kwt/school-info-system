"use client";

import { useEffect, useState } from "react";

interface ClassOption {
  id: number;
  name: string;
  section: string;
}

interface FeeStructureOption {
  id: number;
  term: string;
  amount: number;
  dueDate: string;
}

interface FeeRosterEntry {
  studentId: number;
  name: string;
  amountPaid: number;
  amount: number;
  status: "paid" | "partial" | "unpaid";
}

export function FeesView({
  classes,
  role,
}: {
  classes: ClassOption[];
  role: "admin" | "accountant";
}) {
  const [classId, setClassId] = useState(classes[0] ? String(classes[0].id) : "");
  const [feeStructures, setFeeStructures] = useState<FeeStructureOption[]>([]);
  const [feeStructureId, setFeeStructureId] = useState("");
  const [students, setStudents] = useState<FeeRosterEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [paymentEdits, setPaymentEdits] = useState<Record<number, string>>({});
  const [newTerm, setNewTerm] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newDueDate, setNewDueDate] = useState("");

  async function refreshFeeStructures() {
    if (!classId) return;
    const response = await fetch(`/api/fee-structures?classId=${classId}`);
    if (!response.ok) {
      const body = await response.json();
      setError(body.error);
      setFeeStructures([]);
      return;
    }
    const body = await response.json();
    setFeeStructures(body.feeStructures);
    setFeeStructureId(body.feeStructures[0] ? String(body.feeStructures[0].id) : "");
  }

  async function refreshRoster() {
    if (!feeStructureId) {
      setStudents([]);
      return;
    }
    const response = await fetch(`/api/fee-payments?feeStructureId=${feeStructureId}`);
    if (!response.ok) {
      const body = await response.json();
      setError(body.error);
      setStudents([]);
      return;
    }
    const body = await response.json();
    setStudents(body.students);
  }

  useEffect(() => {
    setError(null);
    setMessage(null);
    refreshFeeStructures();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  useEffect(() => {
    setError(null);
    setMessage(null);
    refreshRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feeStructureId]);

  async function handleCreateFeeStructure() {
    setError(null);
    setMessage(null);
    const response = await fetch("/api/fee-structures", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        classId: Number(classId),
        term: newTerm,
        amount: Number(newAmount),
        dueDate: newDueDate,
      }),
    });

    if (response.ok) {
      setMessage("Fee structure created");
      setNewTerm("");
      setNewAmount("");
      setNewDueDate("");
      await refreshFeeStructures();
      return;
    }
    const body = await response.json();
    setError(body.error);
  }

  async function handleRecordPayment(studentId: number) {
    setError(null);
    setMessage(null);
    const amount = Number(paymentEdits[studentId] ?? 0);
    const response = await fetch("/api/fee-payments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ feeStructureId: Number(feeStructureId), studentId, amount }),
    });

    if (response.ok) {
      const body = await response.json();
      setMessage("Payment recorded");
      setStudents((prev) =>
        prev.map((student) =>
          student.studentId === studentId
            ? { ...student, amountPaid: body.amountPaid, status: body.status }
            : student
        )
      );
      setPaymentEdits((prev) => ({ ...prev, [studentId]: "" }));
      return;
    }
    const body = await response.json();
    setError(body.error);
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
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
        <select
          aria-label="Fee structure"
          value={feeStructureId}
          onChange={(event) => setFeeStructureId(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        >
          {feeStructures.map((fs) => (
            <option key={fs.id} value={fs.id}>
              {fs.term} — ₹{fs.amount}, due {fs.dueDate}
            </option>
          ))}
        </select>

        {role === "admin" && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              aria-label="New term"
              placeholder="Term"
              value={newTerm}
              onChange={(event) => setNewTerm(event.target.value)}
              className="rounded border border-gray-300 px-2 py-1"
            />
            <input
              type="number"
              aria-label="New amount"
              placeholder="Amount"
              value={newAmount}
              onChange={(event) => setNewAmount(event.target.value)}
              className="rounded border border-gray-300 px-2 py-1"
            />
            <input
              type="date"
              aria-label="New due date"
              value={newDueDate}
              onChange={(event) => setNewDueDate(event.target.value)}
              className="rounded border border-gray-300 px-2 py-1"
            />
            <button
              type="button"
              onClick={handleCreateFeeStructure}
              className="rounded bg-blue-600 px-3 py-1 text-white"
            >
              New Fee Structure
            </button>
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {message && <p className="mt-2 text-sm text-green-600">{message}</p>}

      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr>
            <th className="border-b border-gray-200 pb-2">Name</th>
            <th className="border-b border-gray-200 pb-2">Paid</th>
            <th className="border-b border-gray-200 pb-2">Due</th>
            <th className="border-b border-gray-200 pb-2">Status</th>
            <th className="border-b border-gray-200 pb-2">Record Payment</th>
          </tr>
        </thead>
        <tbody>
          {students.map((student) => (
            <tr key={student.studentId}>
              <td className="border-b border-gray-100 py-2">{student.name}</td>
              <td className="border-b border-gray-100 py-2">₹{student.amountPaid}</td>
              <td className="border-b border-gray-100 py-2">₹{student.amount}</td>
              <td
                className={`border-b border-gray-100 py-2 ${
                  student.status === "paid"
                    ? "text-green-600"
                    : student.status === "partial"
                      ? "text-amber-600"
                      : "text-red-600"
                }`}
              >
                {student.status.charAt(0).toUpperCase() + student.status.slice(1)}
              </td>
              <td className="border-b border-gray-100 py-2">
                <input
                  type="number"
                  aria-label={`Payment amount for ${student.name}`}
                  value={paymentEdits[student.studentId] ?? ""}
                  onChange={(event) =>
                    setPaymentEdits((prev) => ({
                      ...prev,
                      [student.studentId]: event.target.value,
                    }))
                  }
                  className="w-20 rounded border border-gray-300 px-2 py-1"
                />
                <button
                  type="button"
                  onClick={() => handleRecordPayment(student.studentId)}
                  className="ml-2 rounded bg-blue-600 px-2 py-1 text-white"
                >
                  Record
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
