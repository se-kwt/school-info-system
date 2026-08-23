import { Prisma } from "@prisma/client";

export function toNumber(value: Prisma.Decimal | number): number {
  return typeof value === "number" ? value : value.toNumber();
}

export function formatMoney(value: Prisma.Decimal | number): string {
  const amount = toNumber(value);
  return `₹${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
