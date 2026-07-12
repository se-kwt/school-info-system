"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type Step = "phone" | "otp";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [testOtp, setTestOtp] = useState<string | null>(null);

  useEffect(() => {
    if (!testOtp) return;
    const timeout = setTimeout(() => setTestOtp(null), 15000);
    return () => clearTimeout(timeout);
  }, [testOtp]);

  async function handleSendCode(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const response = await fetch("/api/auth/send-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone }),
    });

    if (response.status === 200) {
      const body = await response.json();
      setTestOtp(typeof body.code === "string" ? body.code : null);
      setStep("otp");
      return;
    }
    if (response.status === 404) {
      setError("Phone number is not registered");
      return;
    }
    setError("Enter a phone number");
  }

  async function handleVerifyCode(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone, code }),
    });

    if (response.status === 200) {
      const body = await response.json();
      router.push(body.role === "parent" ? "/parent" : "/dashboard");
      return;
    }
    if (response.status === 401) {
      setError("Incorrect or expired code. Try again");
      return;
    }
    setError("Enter the code");
  }

  function handleChangeNumber() {
    setStep("phone");
    setCode("");
    setError(null);
  }

  const testOtpToast = testOtp && (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-lg bg-neutral-900 px-4 py-3 text-sm text-white shadow-lg"
    >
      Test OTP: <span className="font-bold tracking-wide">{testOtp}</span>
    </div>
  );

  if (step === "phone") {
    return (
      <main className="mx-auto mt-24 max-w-sm p-6">
        <h1 className="mb-4 text-xl font-semibold text-gray-800">Log in</h1>
        <form onSubmit={handleSendCode} className="flex flex-col gap-3">
          <input
            type="tel"
            aria-label="Phone number"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
            placeholder="Phone number"
          />
          <button type="submit" className="rounded bg-blue-600 px-3 py-2 text-white">
            Send code
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
        {testOtpToast}
      </main>
    );
  }

  return (
    <main className="mx-auto mt-24 max-w-sm p-6">
      <h1 className="mb-4 text-xl font-semibold text-gray-800">Enter code</h1>
      <form onSubmit={handleVerifyCode} className="flex flex-col gap-3">
        <input
          type="text"
          aria-label="Verification code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
          placeholder="6-digit code"
        />
        <button type="submit" className="rounded bg-blue-600 px-3 py-2 text-white">
          Verify
        </button>
        <button
          type="button"
          onClick={handleChangeNumber}
          className="text-sm text-gray-500 underline"
        >
          Change number
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
      {testOtpToast}
    </main>
  );
}
