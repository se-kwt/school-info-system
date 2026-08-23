"use client";

import { useState } from "react";
import { SchoolLogo } from "@/components/SchoolLogo";
import { Field } from "@/components/school-setup/Field";

export function SchoolProfileSettings({
  initialLogoUrl,
  schoolName,
  initialAddress = "",
  initialPhone = "",
  initialEmail = "",
  initialPrincipalName = "",
}: {
  initialLogoUrl: string | null;
  schoolName: string;
  initialAddress?: string;
  initialPhone?: string;
  initialEmail?: string;
  initialPrincipalName?: string;
}) {
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [name, setName] = useState(schoolName);
  const [address, setAddress] = useState(initialAddress);
  const [phone, setPhone] = useState(initialPhone);
  const [email, setEmail] = useState(initialEmail);
  const [principalName, setPrincipalName] = useState(initialPrincipalName);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/school/logo", { method: "POST", body: formData });
    const body = await response.json();

    if (!response.ok) {
      setError(body.error as string);
    } else {
      setLogoUrl(body.logoUrl as string);
    }
    setUploading(false);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);

    const response = await fetch("/api/school", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, address, phone, email, principalName }),
    });
    const body = await response.json();

    if (!response.ok) {
      setSaveError(body.error as string);
    } else {
      setSaved(true);
    }
    setSaving(false);
  }

  return (
    <div className="rounded-2xl border border-neutral-200/60 bg-white p-6 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]">
      <h2 className="mb-4 text-sm font-bold text-neutral-800">School Profile</h2>
      <div className="flex items-center gap-4">
        <SchoolLogo logoUrl={logoUrl} schoolName={schoolName} />
        <p className="text-sm font-semibold text-neutral-800">{schoolName}</p>
      </div>
      <Field label="School Logo" htmlFor="school-logo" className="mt-4 max-w-xs">
        <input
          id="school-logo"
          type="file"
          aria-label="School Logo"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleFileChange}
          disabled={uploading}
          className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
        />
      </Field>
      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="School Name" htmlFor="school-name">
          <input
            id="school-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Principal Name" htmlFor="school-principal-name">
          <input
            id="school-principal-name"
            type="text"
            value={principalName}
            onChange={(e) => setPrincipalName(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Address" htmlFor="school-address" className="sm:col-span-2">
          <input
            id="school-address"
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Phone" htmlFor="school-phone">
          <input
            id="school-phone"
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Email" htmlFor="school-email">
          <input
            id="school-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
          />
        </Field>
      </div>

      {saveError && <p className="mt-2 text-xs font-semibold text-red-600">{saveError}</p>}
      {saved && <p className="mt-2 text-xs font-semibold text-emerald-600">Saved.</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="mt-4 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
