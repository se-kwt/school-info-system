import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireParentRole } from "@/lib/auth/require-parent-role";
import { NotificationBell } from "@/components/parent/NotificationBell";
import { ProfileMenu } from "@/components/parent/ProfileMenu";

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const claims = requireParentRole();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: claims.userId } });
  const school = await prisma.school.findUniqueOrThrow({ where: { id: claims.schoolId } });

  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <header className="flex items-center justify-between border-b border-neutral-200/50 bg-white px-6 py-4">
        <div>
          <Link href="/parent" className="text-sm font-semibold tracking-tight text-neutral-900">
            {school.name}
          </Link>
          <p className="text-[11px] font-medium text-neutral-400">Parent workspace</p>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <ProfileMenu initials={initials} />
        </div>
      </header>
      <main className="p-4 lg:p-6">{children}</main>
    </div>
  );
}
