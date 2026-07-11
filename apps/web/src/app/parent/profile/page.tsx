import { prisma } from "@/lib/prisma";
import { requireParentRole } from "@/lib/auth/require-parent-role";

export default async function ParentProfilePage() {
  const claims = requireParentRole();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: claims.userId } });
  const school = await prisma.school.findUniqueOrThrow({ where: { id: claims.schoolId } });

  return (
    <div className="rounded-2xl border border-neutral-200/60 bg-white p-6 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]">
      <h1 className="mb-4 text-sm font-bold text-neutral-800">Profile</h1>
      <dl className="space-y-3 text-xs">
        <div>
          <dt className="font-semibold text-neutral-400">Name</dt>
          <dd className="text-neutral-800">{user.name}</dd>
        </div>
        <div>
          <dt className="font-semibold text-neutral-400">Phone</dt>
          <dd className="text-neutral-800">{user.phone}</dd>
        </div>
        <div>
          <dt className="font-semibold text-neutral-400">School</dt>
          <dd className="text-neutral-800">{school.name}</dd>
        </div>
      </dl>
    </div>
  );
}
