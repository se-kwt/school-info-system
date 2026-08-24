import { prisma } from "@/lib/prisma";
import { requireParentRole } from "@/lib/auth/require-parent-role";
import { getParentChildrenWithClass } from "@/lib/parent/overview";

export default async function ParentSettingsPage() {
  const claims = await requireParentRole();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: claims.userId } });
  const children = await getParentChildrenWithClass(prisma, claims.userId);

  return (
    <div className="rounded-2xl border border-neutral-200/60 bg-white p-6 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]">
      <h1 className="mb-4 text-sm font-bold text-neutral-800">Settings</h1>
      <dl className="space-y-3 text-xs">
        <div>
          <dt className="font-semibold text-neutral-400">Name</dt>
          <dd className="text-neutral-800">{user.name}</dd>
        </div>
        <div>
          <dt className="font-semibold text-neutral-400">Phone</dt>
          <dd className="text-neutral-800">{user.phone}</dd>
        </div>
      </dl>
      {children.length > 0 && (
        <div className="mt-6 border-t border-neutral-100 pt-4">
          <p className="mb-2 text-[11px] font-semibold text-neutral-400">Children</p>
          <ul className="space-y-2">
            {children.map((child) => (
              <li key={child.id} className="text-xs">
                <span className="font-semibold text-neutral-800">{child.name}</span>
                <span className="ml-2 text-neutral-400">{child.className ?? "Not enrolled"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <form action="/api/auth/logout" method="POST" className="mt-6 border-t border-neutral-100 pt-4">
        <button
          type="submit"
          className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-600 transition-all hover:bg-neutral-50"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
