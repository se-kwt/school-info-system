"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StudentDetailModal, type SaveStudentFields } from "./StudentDetailModal";
import { useSubmitGuard } from "../../hooks/useSubmitGuard";

function noop() {}

async function uploadPhoto(file: File): Promise<{ ok: true; photoUrl: string } | { ok: false; error: string }> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch("/api/students/upload-photo", { method: "POST", body: formData });
  if (!response.ok) {
    const body = await response.json();
    return { ok: false, error: body.error };
  }
  const body = await response.json();
  return { ok: true, photoUrl: body.photoUrl };
}

export function AddStudentPage({
  classes,
  allStudents,
}: {
  classes: { id: number; gradeName: string; section: string }[];
  allStudents: {
    id: number;
    name: string;
    admissionNo: string;
    gender: "male" | "female" | "other" | null;
    class: { gradeName: string; section: string } | null;
  }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { isSubmitting, run } = useSubmitGuard();

  async function handleSave(fields: SaveStudentFields) {
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

      const response = await fetch("/api/students", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: fields.name,
          dob: fields.dob,
          classId: fields.classId ?? undefined,
          admissionNo: fields.admissionNo,
          rollNumber: fields.rollNumber || undefined,
          photoUrl,
          gender: fields.gender || undefined,
          studentIdNumber: fields.studentIdNumber || undefined,
          dateOfJoin: fields.dateOfJoin || undefined,
          address: fields.address || undefined,
          bloodGroup: fields.bloodGroup || undefined,
          nationality: fields.nationality || undefined,
          religion: fields.religion || undefined,
          previousSchool: fields.previousSchool || undefined,
          emergencyContactName: fields.emergencyContactName || undefined,
          emergencyContactPhone: fields.emergencyContactPhone || undefined,
          category: fields.category || undefined,
          admissionDate: fields.admissionDate || undefined,
          parents: fields.parents.map((p) => ({
            relationship: p.relationship,
            name: `${p.firstName} ${p.lastName}`.trim(),
            phone: p.phone,
            email: p.email || undefined,
          })),
          siblingStudentIds: fields.siblingStudentIds,
        }),
      });
      if (response.status === 201) {
        router.push("/dashboard/students");
        return;
      }
      setError((await response.json()).error);
    });
  }

  return (
    <StudentDetailModal
      mode="create"
      variant="page"
      classes={classes}
      allStudents={allStudents}
      isAdmin={true}
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
