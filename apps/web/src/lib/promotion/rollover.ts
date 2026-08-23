import type { PrismaClient } from "@prisma/client";

/**
 * Every clone step takes a `PrismaClient`-shaped client so it can run either
 * standalone or inside an interactive transaction. Pass `tx` from within
 * `confirmPromotionRun`; pass `prisma` from tests.
 */
export async function cloneClasses(
  prisma: PrismaClient,
  params: {
    schoolId: number;
    fromAcademicYearId: number;
    toAcademicYearId: number;
  },
): Promise<Map<number, number>> {
  const sourceClasses = await prisma.class.findMany({
    where: {
      schoolId: params.schoolId,
      academicYearId: params.fromAcademicYearId,
      archived: false,
    },
  });

  const existing = await prisma.class.findMany({
    where: {
      schoolId: params.schoolId,
      academicYearId: params.toAcademicYearId,
    },
  });
  const existingByKey = new Map(
    existing.map((c) => [`${c.gradeId}:${c.section}`, c.id]),
  );

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
        capacity: source.capacity,
        room: source.room,
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
  },
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
    existing.map((l) => `${l.classId}:${l.teacherUserId}:${l.subjectId}`),
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

export async function cloneTimetable(
  prisma: PrismaClient,
  params: {
    classMap: Map<number, number>;
    fromAcademicYearId: number;
    toAcademicYearId: number;
  },
): Promise<{ cloned: number; skippedNoTeacher: number }> {
  const sourceEntries = await prisma.timetableEntry.findMany({
    where: {
      academicYearId: params.fromAcademicYearId,
      classId: { in: [...params.classMap.keys()] },
    },
  });

  const targetFaculty = await prisma.classTeacher.findMany({
    where: { academicYearId: params.toAcademicYearId },
  });
  const facultyKeys = new Set(
    targetFaculty.map((l) => `${l.classId}:${l.teacherUserId}:${l.subjectId}`),
  );

  const existing = await prisma.timetableEntry.findMany({
    where: { academicYearId: params.toAcademicYearId },
  });
  const existingKeys = new Set(
    existing.map((e) => `${e.classId}:${e.dayOfWeek}:${e.periodId}`),
  );
  // `TimetableEntry` also carries a unique constraint on
  // (teacherUserId, dayOfWeek, periodId, academicYearId): a teacher can only be
  // booked in one class at a given day/period. `existingKeys` above only guards
  // the (classId, dayOfWeek, periodId) constraint, so a carried-forward teacher
  // can still collide with a slot the admin hand-built in the target year for a
  // *different* class. Track that separately so we can null the teacher out
  // instead of throwing P2002 mid-transaction.
  const teacherSlotKeys = new Set(
    existing
      .filter((e) => e.teacherUserId !== null)
      .map((e) => `${e.teacherUserId}:${e.dayOfWeek}:${e.periodId}`),
  );

  let cloned = 0;
  let skippedNoTeacher = 0;

  for (const entry of sourceEntries) {
    const targetClassId = params.classMap.get(entry.classId);
    if (targetClassId === undefined) continue;

    const key = `${targetClassId}:${entry.dayOfWeek}:${entry.periodId}`;
    if (existingKeys.has(key)) continue;

    let teacherUserId: number | null = entry.teacherUserId;
    if (
      teacherUserId !== null &&
      !facultyKeys.has(`${targetClassId}:${teacherUserId}:${entry.subjectId}`)
    ) {
      teacherUserId = null;
      skippedNoTeacher += 1;
    }

    if (teacherUserId !== null) {
      const teacherSlotKey = `${teacherUserId}:${entry.dayOfWeek}:${entry.periodId}`;
      if (teacherSlotKeys.has(teacherSlotKey)) {
        teacherUserId = null;
        skippedNoTeacher += 1;
      }
    }

    await prisma.timetableEntry.create({
      data: {
        classId: targetClassId,
        academicYearId: params.toAcademicYearId,
        dayOfWeek: entry.dayOfWeek,
        periodId: entry.periodId,
        subjectId: entry.subjectId,
        teacherUserId,
      },
    });
    existingKeys.add(key);
    if (teacherUserId !== null) {
      teacherSlotKeys.add(
        `${teacherUserId}:${entry.dayOfWeek}:${entry.periodId}`,
      );
    }
    cloned += 1;
  }

  return { cloned, skippedNoTeacher };
}

export async function cloneFeeStructures(
  prisma: PrismaClient,
  params: {
    schoolId: number;
    classMap: Map<number, number>;
    fromAcademicYearId: number;
    toAcademicYearId: number;
  },
): Promise<{ cloned: number }> {
  const sourceStructures = await prisma.feeStructure.findMany({
    where: {
      academicYearId: params.fromAcademicYearId,
      classId: { in: [...params.classMap.keys()] },
    },
  });

  const existing = await prisma.feeStructure.findMany({
    where: { academicYearId: params.toAcademicYearId },
  });
  // `(classId, term)` is a naming convention, not a DB constraint — `FeeStructure`
  // has no `@@unique` on it, and `createFeeStructure` allows duplicates. Two
  // source rows can legitimately share a class and term (e.g. two different fee
  // structures both labeled "Term 1" for different fee categories with different
  // amounts), so the dedupe key also includes `amount` to avoid conflating them
  // and silently dropping one on rollover.
  const existingKeys = new Set(
    existing.map((f) => `${f.classId}:${f.term}:${f.amount.toString()}`),
  );

  let cloned = 0;

  for (const source of sourceStructures) {
    const targetClassId = params.classMap.get(source.classId);
    if (targetClassId === undefined) continue;

    const key = `${targetClassId}:${source.term}:${source.amount.toString()}`;
    if (existingKeys.has(key)) continue;

    const dueDate = new Date(source.dueDate);
    dueDate.setFullYear(dueDate.getFullYear() + 1);

    await prisma.feeStructure.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.toAcademicYearId,
        classId: targetClassId,
        term: source.term,
        amount: source.amount,
        discount: source.discount,
        fineAmount: source.fineAmount,
        dueDate,
      },
    });
    existingKeys.add(key);
    cloned += 1;
  }

  return { cloned };
}

export interface RolloverOptions {
  classes: boolean;
  faculty: boolean;
  timetable: boolean;
  feeStructures: boolean;
}

export interface RolloverSummary {
  classes: number;
  faculty: { cloned: number; skippedInactive: number };
  timetable: { cloned: number; skippedNoTeacher: number };
  feeStructures: number;
}

export async function runRollover(
  prisma: PrismaClient,
  params: {
    schoolId: number;
    fromAcademicYearId: number;
    toAcademicYearId: number;
    options: RolloverOptions;
  },
): Promise<RolloverSummary> {
  const summary: RolloverSummary = {
    classes: 0,
    faculty: { cloned: 0, skippedInactive: 0 },
    timetable: { cloned: 0, skippedNoTeacher: 0 },
    feeStructures: 0,
  };

  if (!params.options.classes) return summary;

  const classMap = await cloneClasses(prisma, {
    schoolId: params.schoolId,
    fromAcademicYearId: params.fromAcademicYearId,
    toAcademicYearId: params.toAcademicYearId,
  });
  summary.classes = classMap.size;

  if (params.options.faculty) {
    summary.faculty = await cloneFaculty(prisma, {
      classMap,
      fromAcademicYearId: params.fromAcademicYearId,
      toAcademicYearId: params.toAcademicYearId,
    });
  }

  if (params.options.timetable) {
    summary.timetable = await cloneTimetable(prisma, {
      classMap,
      fromAcademicYearId: params.fromAcademicYearId,
      toAcademicYearId: params.toAcademicYearId,
    });
  }

  if (params.options.feeStructures) {
    const result = await cloneFeeStructures(prisma, {
      schoolId: params.schoolId,
      classMap,
      fromAcademicYearId: params.fromAcademicYearId,
      toAcademicYearId: params.toAcademicYearId,
    });
    summary.feeStructures = result.cloned;
  }

  return summary;
}
