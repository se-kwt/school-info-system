import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { KebabMenu, type KebabMenuItem } from "./KebabMenu";

export function EntityCard({
  icon: Icon,
  href,
  title,
  subtitle,
  tagLine,
  footerBadge,
  onEdit,
  menuItems,
  blockedMessage,
  blockedActions,
}: {
  icon: LucideIcon;
  href: string;
  title: string;
  subtitle: string;
  tagLine?: string;
  footerBadge?: string;
  onEdit?: () => void;
  menuItems: KebabMenuItem[];
  blockedMessage?: string;
  blockedActions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]">
      <div className="flex items-start justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
          <Icon className="h-5 w-5" />
        </span>
        <KebabMenu label={`Actions for ${title}`} items={menuItems} />
      </div>
      <div>
        <Link href={href} className="text-sm font-bold text-neutral-900 hover:underline">
          {title}
        </Link>
        <p className="text-[11px] text-neutral-400">{subtitle}</p>
      </div>
      {tagLine && <p className="line-clamp-1 text-[11px] text-neutral-500">{tagLine}</p>}

      {blockedMessage ? (
        <div className="rounded-lg bg-amber-50 p-2 text-[11px] text-amber-800">
          <p>{blockedMessage}</p>
          <div className="mt-1.5 flex gap-2">{blockedActions}</div>
        </div>
      ) : (
        (footerBadge || onEdit) && (
          <div className="flex items-center justify-between">
            {footerBadge ? (
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-600">
                {footerBadge}
              </span>
            ) : (
              <span />
            )}
            {onEdit && (
              <button type="button" onClick={onEdit} className="text-xs font-semibold text-indigo-600 hover:underline">
                Edit
              </button>
            )}
          </div>
        )
      )}
    </div>
  );
}
