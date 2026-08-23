import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { toNumber, formatMoney } from "../src/lib/money";

describe("toNumber", () => {
  it("passes a plain number through unchanged", () => {
    expect(toNumber(42)).toBe(42);
  });

  it("converts a Prisma.Decimal to a number", () => {
    expect(toNumber(new Prisma.Decimal("1234.56"))).toBe(1234.56);
  });
});

describe("formatMoney", () => {
  it("formats rupee amounts with separators and two decimals", () => {
    expect(formatMoney(1234567.5)).toBe("₹12,34,567.50");
    expect(formatMoney(0)).toBe("₹0.00");
    expect(formatMoney(999)).toBe("₹999.00");
  });

  it("formats a Prisma.Decimal the same way as an equivalent number", () => {
    expect(formatMoney(new Prisma.Decimal("1000.10"))).toBe("₹1,000.10");
  });
});
