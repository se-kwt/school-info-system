import type { PrismaClient } from "@prisma/client";

export async function runBackfill(prisma: PrismaClient): Promise<void> {
  const schools = await prisma.school.findMany();

  for (const school of schools) {
    const admin = await prisma.user.findFirst({ where: { schoolId: school.id, role: "admin" } });
    if (!admin) continue;

    // Step 1: Create one Grade per distinct Class.name within the school.
    const classes = await prisma.class.findMany({ where: { schoolId: school.id } });
    const gradeByName = new Map<string, number>();

    for (const klass of classes) {
      if (!gradeByName.has(klass.name)) {
        const grade = await prisma.grade.upsert({
          where: { schoolId_name: { schoolId: school.id, name: klass.name } },
          create: { schoolId: school.id, name: klass.name },
          update: {},
        });
        gradeByName.set(klass.name, grade.id);
      }
    }

    // Step 5 (periods): Derive distinct period integers for this school's timetable entries.
    const distinctPeriods = await prisma.timetableEntry.findMany({
      where: { class: { schoolId: school.id } },
      select: { period: true },
      distinct: ["period"],
      orderBy: { period: "asc" },
    });
    const periodByNumber = new Map<number, number>();
    for (const { period } of distinctPeriods) {
      const created = await prisma.period.upsert({
        where: { schoolId_order: { schoolId: school.id, order: period } },
        create: {
          schoolId: school.id,
          order: period,
          label: `Period ${period}`,
          startTime: "09:00",
          endTime: "09:45",
        },
        update: {},
      });
      periodByNumber.set(period, created.id);
    }

    const fallbackYear = await prisma.academicYear.findFirst({
      where: { schoolId: school.id },
      orderBy: { startDate: "desc" },
    });

    // Steps 2–4: Per class, collect subjects, create Subject rows, then handle year-scoped relinking.
    for (const klass of classes) {
      const gradeId = gradeByName.get(klass.name)!;

      // Collect all distinct subject strings referenced by this class.
      const subjectStrings = new Set<string>();
      const [classTeachers, entries, assignments] = await Promise.all([
        prisma.classTeacher.findMany({ where: { classId: klass.id } }),
        prisma.timetableEntry.findMany({ where: { classId: klass.id } }),
        prisma.assignment.findMany({ where: { classId: klass.id } }),
      ]);
      const marks = await prisma.mark.findMany({
        where: { student: { enrollments: { some: { classId: klass.id } } } },
      });
      for (const row of classTeachers) subjectStrings.add(row.subject);
      for (const row of entries) subjectStrings.add(row.subject);
      for (const row of assignments) subjectStrings.add(row.subject);
      for (const row of marks) subjectStrings.add(row.subject);

      // Step 2: Create one Subject per distinct string per Grade, plus SyllabusVersion.
      const subjectByName = new Map<string, number>();
      for (const name of subjectStrings) {
        const subject = await prisma.subject.upsert({
          where: { gradeId_name: { gradeId, name } },
          create: { gradeId, name },
          update: {},
        });
        subjectByName.set(name, subject.id);

        const hasVersion = await prisma.syllabusVersion.findFirst({ where: { subjectId: subject.id } });
        if (!hasVersion) {
          await prisma.syllabusVersion.create({
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
        prisma.enrollment.findMany({ where: { classId: klass.id }, select: { academicYearId: true } }),
        prisma.classTeacher.findMany({ where: { classId: klass.id }, select: { academicYearId: true } }),
        prisma.timetableEntry.findMany({ where: { classId: klass.id }, select: { academicYearId: true } }),
        prisma.assignment.findMany({ where: { classId: klass.id }, select: { academicYearId: true } }),
      ]);
      const yearIds = new Set<number>();
      for (const row of [...enrollments, ...ctYears, ...ttYears, ...asgYears]) {
        yearIds.add(row.academicYearId);
      }

      // Step 3a: Class with zero year references — just set gradeId and fallback year.
      if (yearIds.size === 0) {
        await prisma.class.update({
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
        // Check if a matching year-scoped class already exists.
        const existing = await prisma.class.findFirst({
          where: { gradeId, section: klass.section, academicYearId, schoolId: school.id },
        });
        let targetId: number;
        if (existing) {
          targetId = existing.id;
          if (existing.id === klass.id) originalKlassUsed = true;
        } else if (!originalKlassUsed) {
          // Original row not yet claimed — reuse it for this year.
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
      await prisma.class.update({
        where: { id: klass.id },
        data: { gradeId, academicYearId: primaryYearId },
      });

      // Repoint related rows for the primary year (if original class was reused, skip — same id).
      if (primaryTargetId !== klass.id) {
        await prisma.enrollment.updateMany({
          where: { classId: klass.id, academicYearId: primaryYearId },
          data: { classId: primaryTargetId },
        });
        await prisma.classTeacher.updateMany({
          where: { classId: klass.id, academicYearId: primaryYearId },
          data: { classId: primaryTargetId },
        });
        await prisma.timetableEntry.updateMany({
          where: { classId: klass.id, academicYearId: primaryYearId },
          data: { classId: primaryTargetId },
        });
        await prisma.assignment.updateMany({
          where: { classId: klass.id, academicYearId: primaryYearId },
          data: { classId: primaryTargetId },
        });
      }

      // Repoint related rows for subsequent years to their new class rows.
      for (const academicYearId of yearIdList.slice(1)) {
        const targetId = targetClassByYear.get(academicYearId)!;
        await prisma.enrollment.updateMany({ where: { classId: klass.id, academicYearId }, data: { classId: targetId } });
        await prisma.classTeacher.updateMany({ where: { classId: klass.id, academicYearId }, data: { classId: targetId } });
        await prisma.timetableEntry.updateMany({ where: { classId: klass.id, academicYearId }, data: { classId: targetId } });
        await prisma.assignment.updateMany({ where: { classId: klass.id, academicYearId }, data: { classId: targetId } });
      }

      // Step 4: Set subjectRefId on every related row by matching the scalar subject string.
      const allTargetIds = [...new Set([klass.id, ...targetClassByYear.values()])];

      for (const row of await prisma.classTeacher.findMany({ where: { classId: { in: allTargetIds } } })) {
        const subjectRefId = subjectByName.get(row.subject);
        if (subjectRefId !== undefined) {
          await prisma.classTeacher.update({ where: { id: row.id }, data: { subjectRefId } });
        }
      }
      for (const row of await prisma.timetableEntry.findMany({ where: { classId: { in: allTargetIds } } })) {
        const subjectRefId = subjectByName.get(row.subject);
        const periodRefId = periodByNumber.get(row.period);
        await prisma.timetableEntry.update({
          where: { id: row.id },
          data: {
            ...(subjectRefId !== undefined ? { subjectRefId } : {}),
            ...(periodRefId !== undefined ? { periodRefId } : {}),
          },
        });
      }
      for (const row of await prisma.assignment.findMany({ where: { classId: { in: allTargetIds } } })) {
        const subjectRefId = subjectByName.get(row.subject);
        if (subjectRefId !== undefined) {
          await prisma.assignment.update({ where: { id: row.id }, data: { subjectRefId } });
        }
      }
      for (const row of marks) {
        const subjectRefId = subjectByName.get(row.subject);
        if (subjectRefId !== undefined) {
          await prisma.mark.update({ where: { id: row.id }, data: { subjectRefId } });
        }
      }
    }
  }
}
