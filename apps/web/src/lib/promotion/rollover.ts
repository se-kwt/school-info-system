import type { PrismaClient } from "@prisma/client";

/**
 * Every clone step takes a `PrismaClient`-shaped client so it can run either
 * standalone or inside an interactive transaction. Pass `tx` from within
 * `confirmPromotionRun`; pass `prisma` from tests.
 */
export async function cloneClasses(
  prisma: PrismaClient,
  params: { schoolId: number; fromAcademicYearId: number; toAcademicYearId: number }
): Promise<Map<number, number>> {
  const sourceClasses = await prisma.class.findMany({
    where: { schoolId: params.schoolId, academicYearId: params.fromAcademicYearId, archived: false },
  });

  const existing = await prisma.class.findMany({
    where: { schoolId: params.schoolId, academicYearId: params.toAcademicYearId },
  });
  const existingByKey = new Map(existing.map((c) => [`${c.gradeId}:${c.section}`, c.id]));

  const map = new Map<number, number>();

  for (const source of sourceClasses) {
    const key = `${source.gradeId}:${source.section}`;
    const already = existingByKey.get(key);
    if (already !== undefined) {
      map.set(source.id, already);
      continue;
    }

    const created = await prisma.class.create({
      data: {
        schoolId: params.schoolId,
        gradeId: source.gradeId,
        section: source.section,
        academicYearId: params.toAcademicYearId,
        archived: false,
      },
    });
    existingByKey.set(key, created.id);
    map.set(source.id, created.id);
  }

  return map;
}
