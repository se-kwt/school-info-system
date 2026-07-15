import type { PrismaClient } from "@prisma/client";

export async function runBackfill(prisma: PrismaClient): Promise<void> {
  const schools = await prisma.school.findMany();

  for (const school of schools) {
    const fallbackYear = await prisma.academicYear.findFirst({
      where: { schoolId: school.id },
      orderBy: { startDate: "desc" },
    });

    try {
      await prisma.$transaction(async (tx) => {
        // Fix 4: Log warning and skip if no admin found.
        const admin = await tx.user.findFirst({ where: { schoolId: school.id, role: "admin" } });
        if (!admin) {
          console.warn(`[backfill] school ${school.id} (${school.name}): no admin user found, skipping`);
          return;
        }

        // Step 1: Create one Grade per distinct Class.name within the school.
        const classes = await tx.class.findMany({ where: { schoolId: school.id } });
        const gradeByName = new Map<string, number>();

        for (const klass of classes) {
          if (!gradeByName.has(klass.name)) {
            const grade = await tx.grade.upsert({
              where: { schoolId_name: { schoolId: school.id, name: klass.name } },
              create: { schoolId: school.id, name: klass.name },
              update: {},
            });
            gradeByName.set(klass.name, grade.id);
          }
        }

        // Step 5 (periods): Derive distinct period integers for this school's timetable entries.
        const distinctPeriods = await tx.timetableEntry.findMany({
          where: { class: { schoolId: school.id } },
          select: { period: true },
          distinct: ["period"],
          orderBy: { period: "asc" },
        });
        const periodByNumber = new Map<number, number>();
        for (const { period } of distinctPeriods) {
          const created = await tx.period.upsert({
            where: { schoolId_order: { schoolId: school.id, order: period } },
            create: { schoolId: school.id, order: period, label: `Period ${period}`, startTime: "09:00", endTime: "09:45" /* placeholder; admins update later */ },
            update: {},
          });
          periodByNumber.set(period, created.id);
        }

        // Steps 2–4: Per class, collect subjects, create Subject rows, then handle year-scoped relinking.
        for (const klass of classes) {
          const gradeId = gradeByName.get(klass.name)!;

          // Collect all distinct subject strings referenced by this class.
          const subjectStrings = new Set<string>();
          const [classTeachers, entries, assignments] = await Promise.all([
            tx.classTeacher.findMany({ where: { classId: klass.id } }),
            tx.timetableEntry.findMany({ where: { classId: klass.id } }),
            tx.assignment.findMany({ where: { classId: klass.id } }),
          ]);
          for (const row of classTeachers) subjectStrings.add(row.subject);
          for (const row of entries) subjectStrings.add(row.subject);
          for (const row of assignments) subjectStrings.add(row.subject);

          // Step 2: Create one Subject per distinct string per Grade, plus SyllabusVersion.
          const subjectByName = new Map<string, number>();
          for (const name of subjectStrings) {
            const subject = await tx.subject.upsert({
              where: { gradeId_name: { gradeId, name } },
              create: { gradeId, name },
              update: {},
            });
            subjectByName.set(name, subject.id);

            const hasVersion = await tx.syllabusVersion.findFirst({ where: { subjectId: subject.id } });
            if (!hasVersion) {
              await tx.syllabusVersion.create({
                data: {
                  subjectId: subject.id,
                  versionNum: 1,
                  title: "Initial",
                  content: "",
                  createdById: admin.id,
                },
              });
            }
          }

          // Gather all academic year IDs associated with this class across all relation types.
          const [enrollments, ctYears, ttYears, asgYears] = await Promise.all([
            tx.enrollment.findMany({ where: { classId: klass.id }, select: { academicYearId: true } }),
            tx.classTeacher.findMany({ where: { classId: klass.id }, select: { academicYearId: true } }),
            tx.timetableEntry.findMany({ where: { classId: klass.id }, select: { academicYearId: true } }),
            tx.assignment.findMany({ where: { classId: klass.id }, select: { academicYearId: true } }),
          ]);
          const yearIds = new Set<number>();
          for (const row of [...enrollments, ...ctYears, ...ttYears, ...asgYears]) {
            yearIds.add(row.academicYearId);
          }

          // Step 3a: Class with zero year references — just set gradeId and fallback year.
          if (yearIds.size === 0) {
            await tx.class.update({
              where: { id: klass.id },
              data: { gradeId, academicYearId: fallbackYear?.id ?? null },
            });
            continue;
          }

          // Step 3b: Build year → target class mapping.
          // The @@unique([schoolId, name, section]) constraint is still in place (Task 3 will change it),
          // so we reuse the original row for the first unclaimed year and fall back to the original
          // class ID for any subsequent years (no new rows until Task 3 drops the old constraint).
          const yearIdList = [...yearIds];
          const targetClassByYear = new Map<number, number>();
          let originalKlassUsed = false;

          for (const academicYearId of yearIdList) {
            const existing = await tx.class.findFirst({
              where: { gradeId, section: klass.section, academicYearId, schoolId: school.id },
            });
            let targetId: number;
            if (existing) {
              targetId = existing.id;
              if (existing.id === klass.id) originalKlassUsed = true;
            } else if (!originalKlassUsed) {
              targetId = klass.id;
              originalKlassUsed = true;
            } else {
              // Can't create another row with same school+name+section until Task 3 drops the old
              // unique constraint. Use the original class row as a safe fallback for now.
              targetId = klass.id;
            }
            targetClassByYear.set(academicYearId, targetId);
          }

          // Update the original class row to claim the first year.
          const primaryYearId = yearIdList[0];
          const primaryTargetId = targetClassByYear.get(primaryYearId)!;
          await tx.class.update({
            where: { id: klass.id },
            data: { gradeId, academicYearId: primaryYearId },
          });

          // Repoint related rows for the primary year (if original class was reused, skip — same id).
          if (primaryTargetId !== klass.id) {
            await tx.enrollment.updateMany({
              where: { classId: klass.id, academicYearId: primaryYearId },
              data: { classId: primaryTargetId },
            });
            await tx.classTeacher.updateMany({
              where: { classId: klass.id, academicYearId: primaryYearId },
              data: { classId: primaryTargetId },
            });
            await tx.timetableEntry.updateMany({
              where: { classId: klass.id, academicYearId: primaryYearId },
              data: { classId: primaryTargetId },
            });
            await tx.assignment.updateMany({
              where: { classId: klass.id, academicYearId: primaryYearId },
              data: { classId: primaryTargetId },
            });
          }

          // Repoint related rows for subsequent years to their new class rows.
          for (const academicYearId of yearIdList.slice(1)) {
            const targetId = targetClassByYear.get(academicYearId)!;
            await tx.enrollment.updateMany({ where: { classId: klass.id, academicYearId }, data: { classId: targetId } });
            await tx.classTeacher.updateMany({ where: { classId: klass.id, academicYearId }, data: { classId: targetId } });
            await tx.timetableEntry.updateMany({ where: { classId: klass.id, academicYearId }, data: { classId: targetId } });
            await tx.assignment.updateMany({ where: { classId: klass.id, academicYearId }, data: { classId: targetId } });
          }

          // Step 4: Set subjectRefId on every related row using updateMany grouped by subject (Fix 3).
          const allTargetIds = [...new Set([...targetClassByYear.values(), klass.id])];

          for (const [subjectName, subjectRefId] of subjectByName) {
            await tx.classTeacher.updateMany({
              where: { classId: { in: allTargetIds }, subject: subjectName },
              data: { subjectRefId },
            });
            await tx.timetableEntry.updateMany({
              where: { classId: { in: allTargetIds }, subject: subjectName },
              data: { subjectRefId },
            });
            await tx.assignment.updateMany({
              where: { classId: { in: allTargetIds }, subject: subjectName },
              data: { subjectRefId },
            });
            // Marks need a join through student.enrollments — fetch IDs first, then batch update.
            const markIds = await tx.mark.findMany({
              where: { student: { enrollments: { some: { classId: { in: allTargetIds } } } }, subject: subjectName },
              select: { id: true },
            });
            if (markIds.length > 0) {
              await tx.mark.updateMany({
                where: { id: { in: markIds.map((m) => m.id) } },
                data: { subjectRefId },
              });
            }
          }

          // Update periodRefId for TimetableEntry, grouped by period number.
          for (const [periodNum, periodRefId] of periodByNumber) {
            await tx.timetableEntry.updateMany({
              where: { classId: { in: allTargetIds }, period: periodNum },
              data: { periodRefId },
            });
          }
        }
      }, { timeout: 30000 });
    } catch (err) {
      console.error(`[backfill] school ${school.id} (${school.name}) failed:`, err);
    }
  }
}
