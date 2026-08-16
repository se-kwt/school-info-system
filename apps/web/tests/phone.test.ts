import { describe, it, expect } from "vitest";
import { isValidPhone, normalizePhone } from "../src/lib/phone";

describe("isValidPhone", () => {
  it.each([
    ["+15550001000", true],
    ["+919876543210", true],
    ["9876543210", true], // bare digits, no country code -- still a plausible phone number
    ["", false],
    ["   ", false],
    ["abc", false],
    ["+", false],
    ["123", false], // too short to be a real phone number
  ])("isValidPhone(%s) === %s", (input, expected) => {
    expect(isValidPhone(input)).toBe(expected);
  });
});

describe("normalizePhone", () => {
  it("trims leading/trailing whitespace", () => {
    expect(normalizePhone("  +15550001000  ")).toBe("+15550001000");
  });
});
