import { describe, it, expect } from "vitest";
import { POST as logoutRoute } from "../src/app/api/auth/logout/route";
import { SESSION_COOKIE_NAME } from "../src/lib/auth/session-cookie";

describe("POST /api/auth/logout", () => {
  it("clears the session cookie and redirects to /login", async () => {
    const request = new Request("http://localhost/api/auth/logout", { method: "POST" });
    const response = await logoutRoute(request);
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/login");
    expect(setCookie).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=;`));
    expect(setCookie).toContain("Max-Age=0");
  });
});
