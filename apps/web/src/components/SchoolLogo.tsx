function schoolInitials(schoolName: string): string {
  return schoolName
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function SchoolLogo({
  logoUrl,
  schoolName,
}: {
  logoUrl: string | null;
  schoolName: string;
}) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={schoolName}
        className="h-9 w-9 shrink-0 rounded-lg object-cover"
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={schoolName}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-200 text-xs font-bold text-neutral-600"
    >
      {schoolInitials(schoolName)}
    </div>
  );
}
