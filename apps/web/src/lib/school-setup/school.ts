import type { PrismaClient } from "@prisma/client";

export interface SchoolProfile {
  id: number;
  name: string;
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  principalName: string | null;
}

export type UpdateSchoolProfileResult = { ok: true; school: SchoolProfile } | { ok: false; error: "NOT_FOUND" };

export async function updateSchoolProfile(
  prisma: PrismaClient,
  schoolId: number,
  fields: {
    name?: string;
    address?: string;
    phone?: string;
    email?: string;
    principalName?: string;
  }
): Promise<UpdateSchoolProfileResult> {
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) return { ok: false, error: "NOT_FOUND" };

  const data: { name?: string; address?: string; phone?: string; email?: string; principalName?: string } = {};
  if (fields.name !== undefined) data.name = fields.name;
  if (fields.address !== undefined) data.address = fields.address;
  if (fields.phone !== undefined) data.phone = fields.phone;
  if (fields.email !== undefined) data.email = fields.email;
  if (fields.principalName !== undefined) data.principalName = fields.principalName;

  const updated = await prisma.school.update({ where: { id: schoolId }, data });

  return {
    ok: true,
    school: {
      id: updated.id,
      name: updated.name,
      logoUrl: updated.logoUrl,
      address: updated.address,
      phone: updated.phone,
      email: updated.email,
      principalName: updated.principalName,
    },
  };
}
