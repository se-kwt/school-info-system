"use client";

import { Fragment, useEffect, useState } from "react";
import { formatMoney } from "@/lib/money";

interface ClassOption {
  id: number;
  gradeName: string;
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
  status: "paid" | "partial" | "unpaid" | "overdue";
}

interface PaymentHistoryEntry {
  id: number;
  amountPaid: number;
  paidDate: string;
  mode: string;
  receiptNo: string;
  reference: string | null;
  recordedByName: string;
}

const PAYMENT_MODES = [
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "upi", label: "UPI" },
  { value: "other", label: "Other" },
];

const STATUS_BADGE: Record<FeeRosterEntry["status"], string> = {
  paid: "bg-emerald-50 text-emerald-600",
  partial: "bg-amber-50 text-amber-600",
  unpaid: "bg-red-50 text-red-500",
  overdue: "bg-red-100 text-red-700",
};

const inputClass =
  "rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-800 placeholder-neutral-400 focus:border-neutral-400 focus:outline-none";

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
  const [paymentModeEdits, setPaymentModeEdits] = useState<Record<number, string>>({});
  const [paymentReferenceEdits, setPaymentReferenceEdits] = useState<Record<number, string>>({});
  const [paymentModeErrors, setPaymentModeErrors] = useState<Record<number, string>>({});
  const [newTerm, setNewTerm] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newDiscount, setNewDiscount] = useState("");
  const [newFineAmount, setNewFineAmount] = useState("");
  const [expandedStudentId, setExpandedStudentId] = useState<number | null>(null);
  const [historyByStudent, setHistoryByStudent] = useState<Record<number, PaymentHistoryEntry[]>>({});
  const [historyError, setHistoryError] = useState<string | null>(null);

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
        discount: newDiscount ? Number(newDiscount) : 0,
        fineAmount: newFineAmount ? Number(newFineAmount) : 0,
      }),
    });

    if (response.ok) {
      setMessage("Fee structure created");
      setNewTerm("");
      setNewAmount("");
      setNewDueDate("");
      setNewDiscount("");
      setNewFineAmount("");
      await refreshFeeStructures();
      return;
    }
    const body = await response.json();
    setError(body.error);
  }

  async function handleRecordPayment(studentId: number) {
    setError(null);
    setMessage(null);
    setPaymentModeErrors((prev) => ({ ...prev, [studentId]: "" }));

    const mode = paymentModeEdits[studentId] ?? "";
    if (!mode) {
      setPaymentModeErrors((prev) => ({ ...prev, [studentId]: "Select a payment mode" }));
      return;
    }

    const amount = Number(paymentEdits[studentId] ?? 0);
    const reference = paymentReferenceEdits[studentId] ?? "";
    const response = await fetch("/api/fee-payments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        feeStructureId: Number(feeStructureId),
        studentId,
        amount,
        mode,
        reference: reference || undefined,
      }),
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
      setPaymentModeEdits((prev) => ({ ...prev, [studentId]: "" }));
      setPaymentReferenceEdits((prev) => ({ ...prev, [studentId]: "" }));
      if (expandedStudentId === studentId) {
        await loadHistory(studentId);
      }
      return;
    }
    const body = await response.json();
    setError(body.error);
  }

  async function loadHistory(studentId: number) {
    setHistoryError(null);
    const response = await fetch(
      `/api/fee-payments/history?feeStructureId=${feeStructureId}&studentId=${studentId}`
    );
    if (!response.ok) {
      const body = await response.json();
      setHistoryError(body.error);
      return;
    }
    const body = await response.json();
    setHistoryByStudent((prev) => ({ ...prev, [studentId]: body.payments }));
  }

  async function toggleHistory(studentId: number) {
    if (expandedStudentId === studentId) {
      setExpandedStudentId(null);
      return;
    }
    setExpandedStudentId(studentId);
    if (!historyByStudent[studentId]) {
      await loadHistory(studentId);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Class"
          value={classId}
          onChange={(event) => setClassId(event.target.value)}
          className={inputClass}
        >
          {classes.map((klass) => (
            <option key={klass.id} value={klass.id}>
              {klass.gradeName} {klass.section}
            </option>
          ))}
        </select>
        <select
          aria-label="Fee structure"
          value={feeStructureId}
          onChange={(event) => setFeeStructureId(event.target.value)}
          className={inputClass}
        >
          {feeStructures.map((fs) => (
            <option key={fs.id} value={fs.id}>
              {fs.term} — {formatMoney(fs.amount)}, due {fs.dueDate}
            </option>
          ))}
        </select>

        {role === "admin" && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200/60 p-2">
            <input
              type="text"
              aria-label="New term"
              placeholder="Term"
              value={newTerm}
              onChange={(event) => setNewTerm(event.target.value)}
              className={inputClass}
            />
            <input
              type="number"
              aria-label="New amount"
              placeholder="Amount"
              value={newAmount}
              onChange={(event) => setNewAmount(event.target.value)}
              className={inputClass}
            />
            <input
              type="date"
              aria-label="New due date"
              value={newDueDate}
              onChange={(event) => setNewDueDate(event.target.value)}
              className={inputClass}
            />
            <input
              type="number"
              aria-label="New discount"
              placeholder="Discount"
              value={newDiscount}
              onChange={(event) => setNewDiscount(event.target.value)}
              className={inputClass}
            />
            <input
              type="number"
              aria-label="New fine amount"
              placeholder="Fine"
              value={newFineAmount}
              onChange={(event) => setNewFineAmount(event.target.value)}
              className={inputClass}
            />
            <button
              type="button"
              onClick={handleCreateFeeStructure}
              className="rounded-lg bg-neutral-900 px-3 py-1 text-xs font-semibold text-white transition-all hover:bg-black"
            >
              New Fee Structure
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
      {message && <p className="text-xs text-emerald-600">{message}</p>}

      <div className="overflow-x-auto rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] lg:p-5">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              <th className="border-b border-neutral-100 pb-2 pr-4">Name</th>
              <th className="border-b border-neutral-100 pb-2 pr-4">Paid</th>
              <th className="border-b border-neutral-100 pb-2 pr-4">Due</th>
              <th className="border-b border-neutral-100 pb-2 pr-4">Status</th>
              <th className="border-b border-neutral-100 pb-2 pr-4">Record Payment</th>
              <th className="border-b border-neutral-100 pb-2 pr-4">History</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <Fragment key={student.studentId}>
                <tr>
                  <td className="border-b border-neutral-50 py-2 pr-4 font-medium text-neutral-700">
                    {student.name}
                  </td>
                  <td className="border-b border-neutral-50 py-2 pr-4 text-neutral-700">
                    {formatMoney(student.amountPaid)}
                  </td>
                  <td className="border-b border-neutral-50 py-2 pr-4 text-neutral-700">
                    {formatMoney(student.amount)}
                  </td>
                  <td className="border-b border-neutral-50 py-2 pr-4">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_BADGE[student.status]}`}>
                      {student.status.charAt(0).toUpperCase() + student.status.slice(1)}
                    </span>
                  </td>
                  <td className="border-b border-neutral-50 py-2 pr-4">
                    <div className="flex flex-wrap items-center gap-1">
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
                        className={`w-20 ${inputClass}`}
                      />
                      <select
                        aria-label={`Payment mode for ${student.name}`}
                        value={paymentModeEdits[student.studentId] ?? ""}
                        onChange={(event) =>
                          setPaymentModeEdits((prev) => ({
                            ...prev,
                            [student.studentId]: event.target.value,
                          }))
                        }
                        className={inputClass}
                      >
                        <option value="">Select mode</option>
                        {PAYMENT_MODES.map((mode) => (
                          <option key={mode.value} value={mode.value}>
                            {mode.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        aria-label={`Reference for ${student.name}`}
                        placeholder="Reference"
                        value={paymentReferenceEdits[student.studentId] ?? ""}
                        onChange={(event) =>
                          setPaymentReferenceEdits((prev) => ({
                            ...prev,
                            [student.studentId]: event.target.value,
                          }))
                        }
                        className={`w-24 ${inputClass}`}
                      />
                      <button
                        type="button"
                        onClick={() => handleRecordPayment(student.studentId)}
                        className="rounded-lg bg-neutral-900 px-2 py-1 text-xs font-semibold text-white transition-all hover:bg-black"
                      >
                        Record Payment
                      </button>
                    </div>
                    {paymentModeErrors[student.studentId] && (
                      <p className="mt-1 text-[11px] text-red-500">
                        {paymentModeErrors[student.studentId]}
                      </p>
                    )}
                  </td>
                  <td className="border-b border-neutral-50 py-2 pr-4">
                    <button
                      type="button"
                      onClick={() => toggleHistory(student.studentId)}
                      className="rounded-lg border border-neutral-200 px-2 py-1 text-xs font-semibold text-neutral-700 transition-all hover:bg-neutral-50"
                    >
                      {expandedStudentId === student.studentId ? "Hide History" : "Show History"}
                    </button>
                  </td>
                </tr>
                {expandedStudentId === student.studentId && (
                  <tr key={`${student.studentId}-history`}>
                    <td colSpan={6} className="border-b border-neutral-50 bg-neutral-50/60 px-2 py-3">
                      {historyError && <p className="text-xs text-red-500">{historyError}</p>}
                      {(historyByStudent[student.studentId] ?? []).length === 0 ? (
                        <p className="text-xs text-neutral-400">No payments recorded yet.</p>
                      ) : (
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                              <th className="pb-1 pr-4">Date</th>
                              <th className="pb-1 pr-4">Amount</th>
                              <th className="pb-1 pr-4">Mode</th>
                              <th className="pb-1 pr-4">Receipt No.</th>
                              <th className="pb-1 pr-4">Reference</th>
                              <th className="pb-1 pr-4">Recorded By</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(historyByStudent[student.studentId] ?? []).map((entry) => (
                              <tr key={entry.id}>
                                <td className="py-1 pr-4 text-neutral-700">{entry.paidDate}</td>
                                <td className="py-1 pr-4 text-neutral-700">{formatMoney(entry.amountPaid)}</td>
                                <td className="py-1 pr-4 text-neutral-700">{entry.mode}</td>
                                <td className="py-1 pr-4 text-neutral-700">{entry.receiptNo}</td>
                                <td className="py-1 pr-4 text-neutral-700">{entry.reference ?? "—"}</td>
                                <td className="py-1 pr-4 text-neutral-700">{entry.recordedByName}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
