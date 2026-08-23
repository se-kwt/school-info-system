import type { EnrollmentStatus, PrismaClient } from "@prisma/client";
import { runRollover, type RolloverOptions, type RolloverSummary } from "./promotion/rollover";

export interface PromotionMappingRow {
  fromClassId: number;
  toClassId: number | null;
}

export type StartPromotionRunResult =
  | { ok: true; id: number; mappings: PromotionMappingRow[] }
  | { ok: false; error: "INVALID_ACADEMIC_YEAR" }
  | { ok: false; error: "NO_ACTIVE_YEAR" }
  | { ok: false; error: "TARGET_YEAR_NOT_UPCOMING" };

export async function startOrResumePromotionRun(
  prisma: PrismaClient,
  params: { schoolId: number; initiatedById: number; toAcademicYearId: number }
): Promise<StartPromotionRunResult> {
  const existingDraft = await prisma.promotionRun.findFirst({
    where: { schoolId: params.schoolId, status: "draft" },
    include: { mappings: true },
  });
  if (existingDraft) {
    return {
      ok: true,
      id: existingDraft.id,
      mappings: existingDraft.mappings.map((mapping) => ({
        fromClassId: mapping.fromClassId,
        toClassId: mapping.toClassId,
      })),
    };
  }

  const fromYear = await prisma.academicYear.findFirst({
    where: { schoolId: params.schoolId, status: "active" },
  });
  if (!fromYear) return { ok: false, error: "NO_ACTIVE_YEAR" };

  const toYear = await prisma.academicYear.findFirst({
    where: { id: params.toAcademicYearId, schoolId: params.schoolId },
  });
  if (!toYear) return { ok: false, error: "INVALID_ACADEMIC_YEAR" };
  if (toYear.status !== "upcoming") return { ok: false, error: "TARGET_YEAR_NOT_UPCOMING" };

  const classesWithEnrollments = await prisma.class.findMany({
    where: {
      schoolId: params.schoolId,
      enrollments: { some: { academicYearId: fromYear.id, status: "active" } },
    },
    include: { grade: true },
  });

  const targetClasses = await prisma.class.findMany({
    where: { schoolId: params.schoolId, academicYearId: toYear.id, archived: false },
    include: { grade: true },
  });

  function inferTarget(klass: (typeof classesWithEnrollments)[number]): number | null {
    const match = targetClasses.find(
      (c) => c.grade.sortOrder === klass.grade.sortOrder + 1 && c.section === klass.section
    );
    return match?.id ?? null;
  }

  const run = await prisma.$transaction(async (tx) => {
    const created = await tx.promotionRun.create({
      data: {
        schoolId: params.schoolId,
        fromAcademicYearId: fromYear.id,
        toAcademicYearId: toYear.id,
        initiatedById: params.initiatedById,
        status: "draft",
      },
    });

    const mappingData = classesWithEnrollments.map((klass) => ({
      promotionRunId: created.id,
      fromClassId: klass.id,
      toClassId: inferTarget(klass),
    }));
    if (mappingData.length > 0) {
      await tx.promotionMapping.createMany({ data: mappingData });
    }
    return created;
  });

  const mappings = await prisma.promotionMapping.findMany({ where: { promotionRunId: run.id } });
  return {
    ok: true,
    id: run.id,
    mappings: mappings.map((mapping) => ({
      fromClassId: mapping.fromClassId,
      toClassId: mapping.toClassId,
    })),
  };
}

export type UpdateMappingsResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "ALREADY_CONFIRMED" }
  | { ok: false; error: "INVALID_MAPPING" }
  | { ok: false; error: "INVALID_TARGET_CLASS" }
  | { ok: false; error: "INVALID_GRADE_PROGRESSION" };

async function validateTargetClasses(
  prisma: PrismaClient,
  params: {
    schoolId: number;
    academicYearId: number;
    pairs: Array<{ fromClassId: number; toClassId: number }>;
  }
): Promise<{ ok: true } | { ok: false; error: "INVALID_TARGET_CLASS" | "INVALID_GRADE_PROGRESSION" }> {
  if (params.pairs.length === 0) return { ok: true };

  const targetIds = [...new Set(params.pairs.map((p) => p.toClassId))];
  const targets = await prisma.class.findMany({
    where: {
      id: { in: targetIds },
      schoolId: params.schoolId,
      academicYearId: params.academicYearId,
      archived: false,
    },
    include: { grade: true },
  });
  if (targets.length !== targetIds.length) return { ok: false, error: "INVALID_TARGET_CLASS" };
  const targetById = new Map(targets.map((c) => [c.id, c]));

  const sourceIds = [...new Set(params.pairs.map((p) => p.fromClassId))];
  const sources = await prisma.class.findMany({
    where: { id: { in: sourceIds }, schoolId: params.schoolId },
    include: { grade: true },
  });
  const sourceById = new Map(sources.map((c) => [c.id, c]));

  for (const pair of params.pairs) {
    const from = sourceById.get(pair.fromClassId);
    const to = targetById.get(pair.toClassId);
    if (!from || !to) return { ok: false, error: "INVALID_TARGET_CLASS" };

    const step = to.grade.sortOrder - from.grade.sortOrder;
    if (step < 0 || step > 1) return { ok: false, error: "INVALID_GRADE_PROGRESSION" };
  }

  return { ok: true };
}

export async function updateMappings(
  prisma: PrismaClient,
  params: {
    promotionRunId: number;
    schoolId: number;
    mappings: Array<{ fromClassId: number; toClassId: number | null }>;
  }
): Promise<UpdateMappingsResult> {
  const run = await prisma.promotionRun.findFirst({
    where: { id: params.promotionRunId, schoolId: params.schoolId },
    include: { mappings: true },
  });
  if (!run) return { ok: false, error: "NOT_FOUND" };
  if (run.status === "confirmed") return { ok: false, error: "ALREADY_CONFIRMED" };

  const existingFromClassIds = new Set(run.mappings.map((mapping) => mapping.fromClassId));
  for (const mapping of params.mappings) {
    if (!existingFromClassIds.has(mapping.fromClassId)) {
      return { ok: false, error: "INVALID_MAPPING" };
    }
  }

  const pairs = params.mappings
    .filter((mapping): mapping is { fromClassId: number; toClassId: number } => mapping.toClassId !== null)
    .map((mapping) => ({ fromClassId: mapping.fromClassId, toClassId: mapping.toClassId }));
  const targetsValid = await validateTargetClasses(prisma, {
    schoolId: params.schoolId,
    academicYearId: run.toAcademicYearId,
    pairs,
  });
  if (!targetsValid.ok) return targetsValid;

  await prisma.$transaction(
    params.mappings.map((mapping) =>
      prisma.promotionMapping.update({
        where: {
          promotionRunId_fromClassId: {
            promotionRunId: params.promotionRunId,
            fromClassId: mapping.fromClassId,
          },
        },
        data: { toClassId: mapping.toClassId },
      })
    )
  );

  return { ok: true };
}

export interface RosterStudentRow {
  studentId: number;
  name: string;
  action: EnrollmentStatus | null;
  toClassId: number | null;
}

export interface RosterClassGroup {
  fromClassId: number;
  toClassId: number | null;
  students: RosterStudentRow[];
}

export type GetRosterForReviewResult =
  | { ok: true; classes: RosterClassGroup[] }
  | { ok: false; error: "NOT_FOUND" };

export async function getRosterForReview(
  prisma: PrismaClient,
  params: { promotionRunId: number; schoolId: number }
): Promise<GetRosterForReviewResult> {
  const run = await prisma.promotionRun.findFirst({
    where: { id: params.promotionRunId, schoolId: params.schoolId },
    include: { mappings: true },
  });
  if (!run) return { ok: false, error: "NOT_FOUND" };

  const logEntries = await prisma.promotionLogEntry.findMany({
    where: { promotionRunId: params.promotionRunId },
  });

  const classes: RosterClassGroup[] = [];
  for (const mapping of run.mappings) {
    const enrolled = await prisma.enrollment.findMany({
      where: { classId: mapping.fromClassId, academicYearId: run.fromAcademicYearId, status: "active" },
      include: { student: true },
      orderBy: { student: { name: "asc" } },
    });
    const students = enrolled.map((enrollment) => {
      const override = logEntries.find((entry) => entry.studentId === enrollment.studentId);
      if (override) {
        return {
          studentId: enrollment.studentId,
          name: enrollment.student.name,
          action: override.action,
          toClassId: override.toClassId,
        };
      }
      if (mapping.toClassId) {
        return {
          studentId: enrollment.studentId,
          name: enrollment.student.name,
          action: "promoted" as const,
          toClassId: mapping.toClassId,
        };
      }
      return {
        studentId: enrollment.studentId,
        name: enrollment.student.name,
        action: null,
        toClassId: null,
      };
    });
    classes.push({ fromClassId: mapping.fromClassId, toClassId: mapping.toClassId, students });
  }

  return { ok: true, classes };
}

export type SetDecisionsResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "ALREADY_CONFIRMED" }
  | { ok: false; error: "STUDENT_NOT_IN_RUN" }
  | { ok: false; error: "MISSING_TARGET_CLASS" }
  | { ok: false; error: "INVALID_TARGET_CLASS" }
  | { ok: false; error: "INVALID_GRADE_PROGRESSION" };

export async function setStudentDecisions(
  prisma: PrismaClient,
  params: {
    promotionRunId: number;
    schoolId: number;
    decisions: Array<{ studentId: number; action: EnrollmentStatus; toClassId?: number }>;
  }
): Promise<SetDecisionsResult> {
  const run = await prisma.promotionRun.findFirst({
    where: { id: params.promotionRunId, schoolId: params.schoolId },
    include: { mappings: true },
  });
  if (!run) return { ok: false, error: "NOT_FOUND" };
  if (run.status === "confirmed") return { ok: false, error: "ALREADY_CONFIRMED" };

  const enrollments = await prisma.enrollment.findMany({
    where: {
      academicYearId: run.fromAcademicYearId,
      status: "active",
      classId: { in: run.mappings.map((mapping) => mapping.fromClassId) },
      studentId: { in: params.decisions.map((decision) => decision.studentId) },
    },
  });
  const enrollmentByStudent = new Map(enrollments.map((enrollment) => [enrollment.studentId, enrollment]));

  const resolved: Array<{
    studentId: number;
    fromClassId: number;
    action: EnrollmentStatus;
    toClassId: number | null;
  }> = [];

  for (const decision of params.decisions) {
    const enrollment = enrollmentByStudent.get(decision.studentId);
    if (!enrollment) return { ok: false, error: "STUDENT_NOT_IN_RUN" };

    let toClassId: number | null = null;
    if (decision.action === "promoted" || decision.action === "retained") {
      if (decision.action === "retained") {
        toClassId = enrollment.classId;
      } else {
        const mapping = run.mappings.find((m) => m.fromClassId === enrollment.classId);
        toClassId = decision.toClassId ?? mapping?.toClassId ?? null;
      }
      if (!toClassId) return { ok: false, error: "MISSING_TARGET_CLASS" };
    }

    resolved.push({
      studentId: decision.studentId,
      fromClassId: enrollment.classId,
      action: decision.action,
      toClassId,
    });
  }

  const resolvedPairs = resolved
    .filter((entry): entry is typeof entry & { toClassId: number } => entry.action === "promoted" && entry.toClassId !== null)
    .map((entry) => ({ fromClassId: entry.fromClassId, toClassId: entry.toClassId }));
  const decisionTargetsValid = await validateTargetClasses(prisma, {
    schoolId: params.schoolId,
    academicYearId: run.toAcademicYearId,
    pairs: resolvedPairs,
  });
  if (!decisionTargetsValid.ok) return decisionTargetsValid;

  await prisma.$transaction(
    resolved.map((entry) =>
      prisma.promotionLogEntry.upsert({
        where: {
          promotionRunId_studentId: {
            promotionRunId: params.promotionRunId,
            studentId: entry.studentId,
          },
        },
        create: {
          promotionRunId: params.promotionRunId,
          studentId: entry.studentId,
          fromClassId: entry.fromClassId,
          toClassId: entry.toClassId,
          action: entry.action,
        },
        update: { toClassId: entry.toClassId, action: entry.action },
      })
    )
  );

  return { ok: true };
}

export interface PromotionCounts {
  promoted: number;
  retained: number;
  graduated: number;
  transferred: number;
  left: number;
  inactive: number;
}

export type GetRunSummaryResult =
  | { ok: true; counts: PromotionCounts; undecidedStudentIds: number[] }
  | { ok: false; error: "NOT_FOUND" };

export async function getRunSummary(
  prisma: PrismaClient,
  params: { promotionRunId: number; schoolId: number }
): Promise<GetRunSummaryResult> {
  const rosterResult = await getRosterForReview(prisma, params);
  if (!rosterResult.ok) return rosterResult;

  const counts: PromotionCounts = {
    promoted: 0,
    retained: 0,
    graduated: 0,
    transferred: 0,
    left: 0,
    inactive: 0,
  };
  const undecidedStudentIds: number[] = [];

  for (const classGroup of rosterResult.classes) {
    for (const student of classGroup.students) {
      if (student.action === null) {
        undecidedStudentIds.push(student.studentId);
        continue;
      }
      if (student.action === "active") {
        continue;
      }
      counts[student.action] += 1;
    }
  }

  return { ok: true, counts, undecidedStudentIds };
}

export type ConfirmPromotionRunResult =
  | { ok: true; rollover?: RolloverSummary }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "ALREADY_CONFIRMED" }
  | { ok: false; error: "UNDECIDED_STUDENTS" };

export async function confirmPromotionRun(
  prisma: PrismaClient,
  params: {
    promotionRunId: number;
    schoolId: number;
    rollover?: RolloverOptions;
  }
): Promise<ConfirmPromotionRunResult> {
  const run = await prisma.promotionRun.findFirst({
    where: { id: params.promotionRunId, schoolId: params.schoolId },
  });
  if (!run) return { ok: false, error: "NOT_FOUND" };
  if (run.status === "confirmed") return { ok: false, error: "ALREADY_CONFIRMED" };

  const rosterResult = await getRosterForReview(prisma, params);
  if (!rosterResult.ok) return rosterResult;

  const allStudents = rosterResult.classes.flatMap((classGroup) => classGroup.students);
  if (allStudents.some((student) => student.action === null)) {
    return { ok: false, error: "UNDECIDED_STUDENTS" };
  }

  const rolloverSummary = await prisma.$transaction(async (tx) => {
    // Demote whichever year is currently active for this school, not just
    // run.fromAcademicYearId specifically: an admin may have activated a
    // different (third) year via activateAcademicYear after this run was
    // drafted, in which case run.fromAcademicYearId is already archived and
    // the currently-active year is the one that must be demoted first, to
    // avoid colliding with the partial unique index on (schoolId) WHERE
    // status = 'active' when we activate run.toAcademicYearId below.
    await tx.academicYear.updateMany({
      where: { schoolId: run.schoolId, status: "active" },
      data: { status: "archived" },
    });
    await tx.academicYear.update({ where: { id: run.toAcademicYearId }, data: { status: "active" } });

    let summary: RolloverSummary | undefined;
    if (params.rollover) {
      summary = await runRollover(tx as PrismaClient, {
        schoolId: params.schoolId,
        fromAcademicYearId: run.fromAcademicYearId,
        toAcademicYearId: run.toAcademicYearId,
        options: params.rollover,
      });
    }

    for (const student of allStudents) {
      if (student.action === null) continue;

      if (student.action === "promoted" || student.action === "retained") {
        await tx.enrollment.create({
          data: {
            studentId: student.studentId,
            classId: student.toClassId as number,
            academicYearId: run.toAcademicYearId,
            status: "active",
          },
        });
      }

      await tx.enrollment.updateMany({
        where: { studentId: student.studentId, academicYearId: run.fromAcademicYearId },
        data: { status: student.action },
      });

      if (student.action !== "promoted" && student.action !== "retained") {
        await tx.student.update({ where: { id: student.studentId }, data: { status: student.action } });
      }

      const classGroup = rosterResult.classes.find((group) =>
        group.students.some((s) => s.studentId === student.studentId)
      );
      await tx.promotionLogEntry.upsert({
        where: {
          promotionRunId_studentId: {
            promotionRunId: params.promotionRunId,
            studentId: student.studentId,
          },
        },
        create: {
          promotionRunId: params.promotionRunId,
          studentId: student.studentId,
          fromClassId: classGroup?.fromClassId as number,
          toClassId: student.toClassId,
          action: student.action,
        },
        update: { toClassId: student.toClassId, action: student.action },
      });
    }

    await tx.promotionRun.update({
      where: { id: params.promotionRunId },
      data: { status: "confirmed", confirmedAt: new Date() },
    });

    return summary;
  }, { timeout: 30_000 });

  return { ok: true, rollover: rolloverSummary };
}

export type RevertPromotionRunResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "NOT_CONFIRMED" }
  | { ok: false; error: "YEAR_HAS_ACTIVITY" }
  | { ok: false; error: "ANOTHER_YEAR_ACTIVE" };

export async function revertPromotionRun(
  prisma: PrismaClient,
  params: { promotionRunId: number; schoolId: number }
): Promise<RevertPromotionRunResult> {
  const run = await prisma.promotionRun.findFirst({
    where: { id: params.promotionRunId, schoolId: params.schoolId },
    include: { toAcademicYear: true },
  });
  if (!run) return { ok: false, error: "NOT_FOUND" };
  if (run.status !== "confirmed") return { ok: false, error: "NOT_CONFIRMED" };

  const [examCount, feeStructureCount, timetableCount, classTeacherCount, assignmentCount, attendanceCount] =
    await Promise.all([
      prisma.exam.count({ where: { academicYearId: run.toAcademicYearId } }),
      prisma.feeStructure.count({ where: { academicYearId: run.toAcademicYearId } }),
      prisma.timetableEntry.count({ where: { academicYearId: run.toAcademicYearId } }),
      prisma.classTeacher.count({ where: { academicYearId: run.toAcademicYearId } }),
      prisma.assignment.count({ where: { academicYearId: run.toAcademicYearId } }),
      prisma.attendance.count({ where: { academicYearId: run.toAcademicYearId } }),
    ]);

  if (
    examCount > 0 ||
    feeStructureCount > 0 ||
    timetableCount > 0 ||
    classTeacherCount > 0 ||
    assignmentCount > 0 ||
    attendanceCount > 0
  ) {
    return { ok: false, error: "YEAR_HAS_ACTIVITY" };
  }

  // Refuse rather than silently demote a genuinely unrelated third year that an
  // admin may have deliberately activated after this run was confirmed. This is
  // distinct from the predicate-based demote inside the transaction below, which
  // still safely handles the expected case where toAcademicYearId is the one
  // active year being demoted.
  const otherActive = await prisma.academicYear.findFirst({
    where: {
      schoolId: params.schoolId,
      status: "active",
      id: { notIn: [run.fromAcademicYearId, run.toAcademicYearId] },
    },
  });
  if (otherActive) return { ok: false, error: "ANOTHER_YEAR_ACTIVE" };

  const logEntries = await prisma.promotionLogEntry.findMany({
    where: { promotionRunId: params.promotionRunId },
  });

  await prisma.$transaction(async (tx) => {
    await tx.enrollment.deleteMany({
      where: {
        academicYearId: run.toAcademicYearId,
        studentId: { in: logEntries.map((entry) => entry.studentId) },
      },
    });
    for (const entry of logEntries) {
      await tx.enrollment.updateMany({
        where: { studentId: entry.studentId, academicYearId: run.fromAcademicYearId },
        data: { status: "active" },
      });
      if (entry.action !== "promoted" && entry.action !== "retained") {
        await tx.student.update({ where: { id: entry.studentId }, data: { status: "active" } });
      }
    }

    // Order matters: the partial unique index on (schoolId) WHERE status = 'active'
    // is checked per-statement, not deferred to commit. Demote whichever year is
    // currently active before reactivating the "from" year, or both rows would
    // briefly be active at once and the second update would violate the
    // constraint. This is deliberately predicate-based rather than targeting
    // run.toAcademicYearId specifically: an admin may have activated a different
    // (third) year via activateAcademicYear after this run was confirmed, in
    // which case run.toAcademicYearId is already archived and the currently-active
    // year is the one that must be demoted first.
    await tx.academicYear.updateMany({
      where: { schoolId: run.schoolId, status: "active" },
      data: { status: "upcoming" },
    });
    await tx.academicYear.update({ where: { id: run.fromAcademicYearId }, data: { status: "active" } });
    await tx.promotionRun.update({ where: { id: params.promotionRunId }, data: { status: "reverted" } });
  });

  return { ok: true };
}
