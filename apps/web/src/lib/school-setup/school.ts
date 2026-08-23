import type { PrismaClient } from "@prisma/client";

export type UpdateSchoolProfileResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "INVALID_NAME" };

export async function updateSchoolProfile(
  prisma: PrismaClient,
  params: {
    schoolId: number;
    fields: {
      name?: string;
      address?: string;
      phone?: string;
      email?: string;
      principalName?: string;
    };
  }
): Promise<UpdateSchoolProfileResult> {
  const school = await prisma.school.findUnique({ where: { id: params.schoolId } });
  if (!school) return { ok: false, error: "NOT_FOUND" };

  if (params.fields.name !== undefined && params.fields.name.trim() === "") {
    return { ok: false, error: "INVALID_NAME" };
  }

  const data: Record<string, string | null> = {};
  if (params.fields.name !== undefined) data.name = params.fields.name.trim();
  if (params.fields.address !== undefined) data.address = params.fields.address || null;
  if (params.fields.phone !== undefined) data.phone = params.fields.phone || null;
  if (params.fields.email !== undefined) data.email = params.fields.email || null;
  if (params.fields.principalName !== undefined) {
    data.principalName = params.fields.principalName || null;
  }

  await prisma.school.update({ where: { id: params.schoolId }, data });
  return { ok: true };
}
