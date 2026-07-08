import { prisma } from "@/lib/prisma";
import { requireDashboardRole } from "@/lib/auth/require-dashboard-role";
import { getDashboardOverview } from "@/lib/dashboard/overview";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ClassPerformancePanel } from "@/components/dashboard/ClassPerformancePanel";
import { StaffOverviewPanel } from "@/components/dashboard/StaffOverviewPanel";
import { AssignmentsDueTable } from "@/components/dashboard/AssignmentsDueTable";
import { TodaysTimetablePanel } from "@/components/dashboard/TodaysTimetablePanel";
import { FeeStructureCollectionPanel } from "@/components/dashboard/FeeStructureCollectionPanel";
import { RecentPaymentsTable } from "@/components/dashboard/RecentPaymentsTable";
import { Users, CheckCircle2, Clock, Wallet, PiggyBank, Receipt } from "lucide-react";

export default async function DashboardHomePage() {
  const claims = requireDashboardRole(["teacher", "admin", "accountant"]);
  const overview = await getDashboardOverview(prisma, claims);

  if (overview.role === "accountant") {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            icon={Wallet}
            colorClassName="border-emerald-100 bg-emerald-50 text-emerald-600"
            value={`₹${overview.feesCollectedThisTerm}`}
            label="Collected This Term"
          />
          <KpiCard
            icon={PiggyBank}
            colorClassName="border-red-100 bg-red-50 text-red-500"
            value={`₹${overview.outstandingAmount}`}
            label="Outstanding Amount"
          />
          <KpiCard
            icon={Receipt}
            colorClassName="border-blue-100 bg-blue-50 text-blue-600"
            value={String(overview.activeFeeStructures)}
            label="Active Fee Structures"
          />
          <KpiCard
            icon={CheckCircle2}
            colorClassName="border-purple-100 bg-purple-50 text-purple-600"
            value={String(overview.paymentsRecordedToday)}
            label="Payments Recorded Today"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <FeeStructureCollectionPanel feeStructureCollection={overview.feeStructureCollection} />
          <RecentPaymentsTable recentPayments={overview.recentPayments} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Users}
          colorClassName="border-blue-100 bg-blue-50 text-blue-600"
          value={String(overview.totalStudents)}
          label="Total Students"
        />
        <KpiCard
          icon={CheckCircle2}
          colorClassName="border-emerald-100 bg-emerald-50 text-emerald-600"
          value={overview.todayAttendancePercent === null ? "—" : `${overview.todayAttendancePercent}%`}
          label="Today's Attendance"
        />
        <KpiCard
          icon={Wallet}
          colorClassName="border-amber-100 bg-amber-50 text-amber-600"
          value={`₹${overview.feesCollectedThisTerm}`}
          label="Fees Collected This Term"
        />
        <KpiCard
          icon={Clock}
          colorClassName="border-purple-100 bg-purple-50 text-purple-600"
          value={String(overview.upcomingCount)}
          label="Upcoming (7 days)"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <ClassPerformancePanel
          classPerformance={overview.classPerformance}
          attendanceTrend={overview.attendanceTrend}
        />
        <StaffOverviewPanel
          staffCapacityPercent={overview.staffCapacityPercent}
          staffOverview={overview.staffOverview}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <AssignmentsDueTable assignmentsDue={overview.assignmentsDue} />
        <TodaysTimetablePanel todaysTimetable={overview.todaysTimetable} />
      </div>
    </div>
  );
}
