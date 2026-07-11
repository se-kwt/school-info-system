import { describe, it, expect } from "vitest";
import { resolveActiveChild } from "../src/lib/parent/resolve-child";

describe("resolveActiveChild", () => {
  const children = [
    { id: 1, name: "Rohan" },
    { id: 2, name: "Meera" },
  ];

  it("returns the child matching requestedId", () => {
    expect(resolveActiveChild(children, 2)).toEqual({ id: 2, name: "Meera" });
  });

  it("falls back to the first child when requestedId is undefined", () => {
    expect(resolveActiveChild(children, undefined)).toEqual({ id: 1, name: "Rohan" });
  });

  it("falls back to the first child when requestedId matches no child", () => {
    expect(resolveActiveChild(children, 999)).toEqual({ id: 1, name: "Rohan" });
  });
});
