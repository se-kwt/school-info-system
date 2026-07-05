import type { PrismaClient } from "@prisma/client";

export interface ClassSummary {
  id: number;
  name: string;
  section: string;
}

export async function listClasses(prisma: PrismaClient, schoolId: number): Promise<ClassSummary[]> {
  return prisma.class.findMany({
    where: { schoolId },
    select: { id: true, name: true, section: true },
    orderBy: [{ name: "asc" }, { section: "asc" }],
  });
}

export type CreateClassResult = { ok: true; class: ClassSummary } | { ok: false; error: "DUPLICATE" };

export async function createClass(
  prisma: PrismaClient,
  schoolId: number,
  input: { name: string; section: string }
): Promise<CreateClassResult> {
  const existing = await prisma.class.findFirst({
    where: { schoolId, name: input.name, section: input.section },
  });
  if (existing) {
    return { ok: false, error: "DUPLICATE" };
  }

  const created = await prisma.class.create({
    data: { schoolId, name: input.name, section: input.section },
    select: { id: true, name: true, section: true },
  });
  return { ok: true, class: created };
}
