"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StaffDetailModal, type SaveStaffFields } from "./StaffDetailModal";
import { useSubmitGuard } from "../../hooks/useSubmitGuard";

function noop() {}

async function uploadPhoto(file: File): Promise<{ ok: true; photoUrl: string } | { ok: false; error: string }> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch("/api/staff/upload-photo", { method: "POST", body: formData });
  if (!response.ok) {
    const body = await response.json();
    return { ok: false, error: body.error };
  }
  const body = await response.json();
  return { ok: true, photoUrl: body.photoUrl };
}

export function AddStaffPage({
  classes,
  subjects,
}: {
  classes: { id: number; gradeId: number; gradeName: string; section: string }[];
  subjects: { id: number; name: string; gradeId: number }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { isSubmitting, run } = useSubmitGuard();

  async function handleSave(fields: SaveStaffFields) {
    setError(null);
    await run(async () => {
      let photoUrl: string | undefined;
      if (fields.photoFile) {
        const uploadResult = await uploadPhoto(fields.photoFile);
        if (!uploadResult.ok) {
          setError(uploadResult.error);
          return;
        }
        photoUrl = uploadResult.photoUrl;
      }

      const response = await fetch("/api/staff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: fields.name,
          phone: fields.phone,
          role: fields.role,
          classId: fields.classId ?? undefined,
          subjectId: fields.subjectId ?? undefined,
          email: fields.email || undefined,
          qualification: fields.qualification || undefined,
          designation: fields.designation || undefined,
          joiningDate: fields.joiningDate || undefined,
          salary: fields.salary !== "" ? Number(fields.salary) : undefined,
          address: fields.address || undefined,
          photoUrl,
        }),
      });
      if (response.status === 201) {
        router.push("/dashboard/staff");
        return;
      }
      setError((await response.json()).error);
    });
  }

  return (
    <StaffDetailModal
      mode="create"
      variant="page"
      classes={classes}
      subjects={subjects}
      isSelf={false}
      serverError={error}
      deleteBlocked={false}
      isSubmitting={isSubmitting}
      onClose={noop}
      onSave={handleSave}
      onDelete={noop}
      onDeactivate={noop}
      onCancelDelete={noop}
      onActivate={noop}
    />
  );
}
