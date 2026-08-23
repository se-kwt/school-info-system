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

export async function cloneFaculty(
  prisma: PrismaClient,
  params: {
    classMap: Map<number, number>;
    fromAcademicYearId: number;
    toAcademicYearId: number;
  }
): Promise<{ cloned: number; skippedInactive: number }> {
  const sourceLinks = await prisma.classTeacher.findMany({
    where: {
      academicYearId: params.fromAcademicYearId,
      classId: { in: [...params.classMap.keys()] },
    },
    include: { teacher: true },
  });

  const existing = await prisma.classTeacher.findMany({
    where: { academicYearId: params.toAcademicYearId },
  });
  const existingKeys = new Set(
    existing.map((l) => `${l.classId}:${l.teacherUserId}:${l.subjectId}`)
  );

  let cloned = 0;
  let skippedInactive = 0;

  for (const link of sourceLinks) {
    if (link.teacher.status !== "active") {
      skippedInactive += 1;
      continue;
    }

    const targetClassId = params.classMap.get(link.classId);
    if (targetClassId === undefined) continue;

    const key = `${targetClassId}:${link.teacherUserId}:${link.subjectId}`;
    if (existingKeys.has(key)) continue;

    await prisma.classTeacher.create({
      data: {
        classId: targetClassId,
        teacherUserId: link.teacherUserId,
        subjectId: link.subjectId,
        academicYearId: params.toAcademicYearId,
        isClassTeacher: link.isClassTeacher,
      },
    });
    existingKeys.add(key);
    cloned += 1;
  }

  return { cloned, skippedInactive };
}
