"use client";

import { useState } from "react";
import { SchoolLogo } from "@/components/SchoolLogo";
import { Field } from "@/components/school-setup/Field";

export function SchoolProfileSettings({
  initialLogoUrl,
  schoolName,
}: {
  initialLogoUrl: string | null;
  schoolName: string;
}) {
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

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
    </div>
  );
}
