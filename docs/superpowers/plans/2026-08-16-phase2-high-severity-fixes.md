# Phase 2 High-Severity Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 21 high-severity findings from the original codebase audit that were deferred out of the critical-fixes plan — OTP brute-force/enumeration, missing rate limiting, an attendance timezone bug, missing input validation and pagination, missing loading/error boundaries, N+1 dashboard queries, two remaining tenant-check gaps, and missing teacher double-booking detection.

**Architecture:** Ten independent, sequential tasks, each scoped to one narrow slice of `apps/web/src/lib/**`, `apps/web/src/app/**`, or `apps/web/prisma/**`. Each is covered by a new failing-then-passing Vitest test against the real Postgres test database and lands as its own commit. This branch (`claude/phase2-high-severity-fixes`) is based on `main` at `dbe540a`, which already includes the async auth-guard conversion and all other Phase 1 fixes — every task below assumes `requireApiRole`/`requireDashboardRole`/`requireParentRole` are async and already properly awaited at every call site it touches.

**Tech Stack:** Next.js 14.2.35, React 18.3, Prisma 5.20, PostgreSQL, Vitest (tests run against a real DB, `fileParallelism: false`), TypeScript.

## Global Constraints

- Every fix must keep `npx tsc --noEmit` and `npm run build` clean inside `apps/web/`.
- Every fix must keep all currently-passing tests green (this branch starts at 479/479 passing — a clean baseline, unlike the Phase 1 branch which started with 8 known pre-existing failures).
- Follow existing code conventions: discriminated-union `Result` return types, Prisma `$transaction` for multi-step writes, `resetDb()` + real-Postgres integration tests under `apps/web/tests/`.
- New error codes are additive to existing discriminated unions — never change the shape of an existing `ok: false` branch other callers already match on.
- Do not fix unrelated findings inside a task's scope — each task is exactly what it claims.
- **One correction already made to the source audit:** the audit's "marks.ts accepts null past validation" finding is stale — `apps/web/src/lib/marks.ts:107,114` already has correct `Number.isFinite`-equivalent range validation (`maxMarks <= 0` rejected, `marksObtained >= 0 && marksObtained <= maxMarks` checked) and the API route additionally rejects falsy `maxMarks` before calling in. This is not a task in this plan.
- **One design default this plan takes, flagged for visibility:** the attendance-timezone fix (Task 4) hardcodes `Asia/Kolkata` (IST) as the school's local timezone, since `School` has no `timezone` column and the audit frames this as an Indian K-12 product. If schools in other timezones are ever supported, this becomes a schema migration (`School.timezone`) — out of scope here.

---

### Task 1: Enforce the OTP attempt limit

**Files:**
- Modify: `apps/web/src/lib/auth/verify-otp.ts` (23 lines, full file below)
- Test: `apps/web/tests/verify-otp.test.ts` (check `find apps/web/tests -iname "*verify-otp*" -o -iname "*otp*"` first — extend if it exists, create if not, following the file-scaffold pattern used by every other lib test: `resetDb()` in `beforeEach`, `prisma`/`resetDb` imported from `./helpers/db`)

Current code:
```typescript
export type VerifyOtpResult =
  | { ok: true; token: string; role: SessionClaims["role"] }
  | { ok: false; error: "INVALID_CODE" | "EXPIRED" | "NOT_FOUND" };

export async function verifyOtp(
  phone: string,
  code: string,
  deps: { prisma: PrismaClient }
): Promise<VerifyOtpResult> {
  const otpRecord = await deps.prisma.otpCode.findFirst({
    where: { phone, usedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!otpRecord) {
    return { ok: false, error: "NOT_FOUND" };
  }

  if (otpRecord.expiresAt < new Date()) {
    return { ok: false, error: "EXPIRED" };
  }

  const isValid = verifyOtpCode(code, otpRecord.codeHash, otpRecord.salt);
  if (!isValid) {
    await deps.prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, error: "INVALID_CODE" };
  }
  // ... success path unchanged
```
`OtpCode.attempts` (`prisma/schema.prisma:435`) is incremented on every wrong guess but never read anywhere in the codebase — a 6-digit code with unlimited guesses within its 5-minute window.

**Interfaces:**
- Produces: new error variant `{ ok: false; error: "TOO_MANY_ATTEMPTS" }` on `VerifyOtpResult`.

- [ ] **Step 1: Write the failing test**

```typescript
it("rejects verification after 5 wrong attempts even with the correct code on the 6th try", async () => {
  const school = await prisma.school.create({ data: { name: "Test School" } });
  const user = await prisma.user.create({
    data: { schoolId: school.id, phone: "+15550001234", name: "Test Parent", role: "parent" },
  });
  const { hash, salt } = hashOtpCode("123456"); // import hashOtpCode from "../src/lib/auth/otp"
  const record = await prisma.otpCode.create({
    data: { phone: user.phone, codeHash: hash, salt, expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
  });

  for (let i = 0; i < 5; i++) {
    const result = await verifyOtp(user.phone, "000000", { prisma });
    expect(result).toMatchObject({ ok: false, error: "INVALID_CODE" });
  }

  const sixthAttempt = await verifyOtp(user.phone, "123456", { prisma }); // correct code, but limit already hit
  expect(sixthAttempt).toMatchObject({ ok: false, error: "TOO_MANY_ATTEMPTS" });

  const finalRecord = await prisma.otpCode.findUnique({ where: { id: record.id } });
  expect(finalRecord?.usedAt).toBeNull(); // never consumed
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd apps/web && npx vitest run tests/verify-otp.test.ts -t "5 wrong attempts"
```
Expected: FAIL — today the 6th call succeeds with the correct code regardless of prior attempts.

- [ ] **Step 3: Add the limit**

```typescript
const MAX_OTP_ATTEMPTS = 5;

export type VerifyOtpResult =
  | { ok: true; token: string; role: SessionClaims["role"] }
  | { ok: false; error: "INVALID_CODE" | "EXPIRED" | "NOT_FOUND" | "TOO_MANY_ATTEMPTS" };

export async function verifyOtp(
  phone: string,
  code: string,
  deps: { prisma: PrismaClient }
): Promise<VerifyOtpResult> {
  const otpRecord = await deps.prisma.otpCode.findFirst({
    where: { phone, usedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!otpRecord) {
    return { ok: false, error: "NOT_FOUND" };
  }

  if (otpRecord.expiresAt < new Date()) {
    return { ok: false, error: "EXPIRED" };
  }

  if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
    return { ok: false, error: "TOO_MANY_ATTEMPTS" };
  }

  const isValid = verifyOtpCode(code, otpRecord.codeHash, otpRecord.salt);
  // ... rest unchanged
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
cd apps/web && npx vitest run tests/verify-otp.test.ts -t "5 wrong attempts"
```
Expected: PASS

- [ ] **Step 5: Update the API route's error mapping**

Find the verify-otp route (`apps/web/src/app/api/auth/verify-otp/route.ts`) and add a `TOO_MANY_ATTEMPTS` branch — 429 status is the conventional choice, with a message like "Too many incorrect attempts. Request a new code."

- [ ] **Step 6: Run the full suite, typecheck, build**

```bash
cd apps/web && npm test && npx tsc --noEmit && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/auth/verify-otp.ts apps/web/src/app/api/auth/verify-otp apps/web/tests/verify-otp.test.ts
git commit -m "fix: enforce max OTP verification attempts"
```

---

### Task 2: Close OTP phone-number enumeration

**Files:**
- Modify: `apps/web/src/lib/auth/send-otp.ts` (23 lines, full file below), `apps/web/src/app/api/auth/send-otp/route.ts`
- Test: `apps/web/tests/send-otp.test.ts` (check for an existing file first, extend if present)

Current code (`send-otp.ts`):
```typescript
export async function sendOtp(
  phone: string,
  deps: { prisma: PrismaClient; smsSender: SmsSender; exposeCodeForTesting?: boolean }
): Promise<{ success: true; code?: string }> {
  const user = await deps.prisma.user.findUnique({ where: { phone } });
  if (!user || user.status === "inactive") {
    throw new Error("PHONE_NOT_REGISTERED");
  }
  // ... generates code, creates OtpCode row, sends SMS, returns { success: true, code? }
```
`apps/web/src/app/api/auth/send-otp/route.ts` catches that thrown error and returns **404** for an unregistered/inactive phone vs **200** for a registered one — an attacker can enumerate every phone number in the system by sending each one to this endpoint and reading the status code.

**Interfaces:**
- `sendOtp`'s return type changes from `Promise<{ success: true; code?: string }>` to `Promise<{ success: true; code?: string }>` (unchanged shape) but it **no longer throws** for an unregistered/inactive phone — it returns the same `{ success: true }` shape either way, having done nothing internally.

- [ ] **Step 1: Write the failing test**

```typescript
it("returns the identical response shape for an unregistered phone as for a registered one, and does not create an OtpCode row", async () => {
  const school = await prisma.school.create({ data: { name: "Test School" } });
  await prisma.user.create({
    data: { schoolId: school.id, phone: "+15550002222", name: "Registered", role: "parent" },
  });

  const fakeSmsSender = { send: vi.fn() };

  const registeredResult = await sendOtp("+15550002222", { prisma, smsSender: fakeSmsSender });
  const unregisteredResult = await sendOtp("+15550009999", { prisma, smsSender: fakeSmsSender });

  expect(registeredResult).toEqual({ success: true });
  expect(unregisteredResult).toEqual({ success: true }); // identical shape -- no way to tell them apart
  expect(fakeSmsSender.send).toHaveBeenCalledTimes(1); // only the registered phone actually got an SMS

  const otpRows = await prisma.otpCode.findMany({ where: { phone: "+15550009999" } });
  expect(otpRows).toHaveLength(0); // nothing generated/stored for the unregistered phone
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd apps/web && npx vitest run tests/send-otp.test.ts -t "identical response shape"
```
Expected: FAIL — today `sendOtp("+15550009999", ...)` throws `Error("PHONE_NOT_REGISTERED")` instead of resolving.

- [ ] **Step 3: Fix `sendOtp` to no-op silently instead of throwing**

```typescript
export async function sendOtp(
  phone: string,
  deps: { prisma: PrismaClient; smsSender: SmsSender; exposeCodeForTesting?: boolean }
): Promise<{ success: true; code?: string }> {
  const user = await deps.prisma.user.findUnique({ where: { phone } });
  if (!user || user.status === "inactive") {
    // Do not reveal whether this phone is registered -- return the same shape
    // as a real send, having done nothing.
    return { success: true };
  }

  const code = generateOtpCode();
  const { hash, salt } = hashOtpCode(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await deps.prisma.otpCode.create({
    data: { phone, codeHash: hash, salt, expiresAt },
  });

  await deps.smsSender.send(phone, `Your School IS verification code is ${code}`);

  return deps.exposeCodeForTesting ? { success: true, code } : { success: true };
}
```

- [ ] **Step 4: Simplify the API route — remove the now-dead 404 branch**

```typescript
export async function POST(request: Request) {
  let phone: string | undefined;
  try {
    ({ phone } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!phone) {
    return NextResponse.json({ error: "phone is required" }, { status: 400 });
  }
  const result = await sendOtp(phone, {
    prisma,
    smsSender: new ConsoleSmsSender(),
    exposeCodeForTesting: process.env.EXPOSE_OTP_FOR_TESTING === "true",
  });
  return NextResponse.json({ success: true, code: result.code });
}
```

- [ ] **Step 5: Check for and update any existing test asserting the old 404 behavior**

```bash
cd apps/web && grep -rln "PHONE_NOT_REGISTERED\|not registered" tests/
```
Any test asserting a 404/error response for an unregistered phone needs to change to assert the new uniform 200 response — this is an intentional behavior change, not a regression, so update rather than preserve the old assertion.

- [ ] **Step 6: Run the test to confirm it passes, then the full suite**

```bash
cd apps/web && npx vitest run tests/send-otp.test.ts -t "identical response shape" && npm test && npx tsc --noEmit && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/auth/send-otp.ts apps/web/src/app/api/auth/send-otp apps/web/tests/send-otp.test.ts
git commit -m "fix: stop leaking phone-number registration status via send-otp status codes"
```

---

### Task 3: Rate-limit OTP send/verify using the existing database (no new infrastructure)

**Why this shape:** the audit flags "no rate limiting anywhere in the repo" as needing a Redis-backed or similar limiter, but this app has no rate-limiting infrastructure decision made yet, and introducing one (Upstash, Vercel KV, etc.) needs credentials only you can provision — the same category of decision as Phase 1's Tasks 8/9. This task instead implements a **self-contained, DB-backed** limiter using the `OtpCode` table itself, which already timestamps every OTP request per phone number. No new dependency, no new infrastructure, no credentials needed — it works today, on any deploy target, including serverless.

**Files:**
- Modify: `apps/web/src/lib/auth/send-otp.ts`, `apps/web/src/lib/auth/verify-otp.ts`
- Test: `apps/web/tests/send-otp.test.ts`, `apps/web/tests/verify-otp.test.ts`

**Interfaces:**
- `sendOtp` gains a new no-throw rejection path: returns `{ success: false, error: "RATE_LIMITED" }` when the same phone has requested more than 3 OTPs in the last 10 minutes (tune these constants if you want different values — they're the only two numbers in this task). This changes `sendOtp`'s return type — update the API route to handle the new `success: false` branch.
- `verifyOtp` already has attempt-limiting from Task 1; this task doesn't touch it further, but note that Task 1's `MAX_OTP_ATTEMPTS` combined with this task's OTP-request throttling together close the brute-force path end-to-end (can't request unlimited codes, can't guess unlimited times per code).

- [ ] **Step 1: Write the failing test**

```typescript
it("rejects a 4th OTP request for the same phone within 10 minutes", async () => {
  const school = await prisma.school.create({ data: { name: "Test School" } });
  await prisma.user.create({
    data: { schoolId: school.id, phone: "+15550003333", name: "Test User", role: "parent" },
  });
  const fakeSmsSender = { send: vi.fn() };

  for (let i = 0; i < 3; i++) {
    const result = await sendOtp("+15550003333", { prisma, smsSender: fakeSmsSender });
    expect(result).toEqual({ success: true });
  }

  const fourth = await sendOtp("+15550003333", { prisma, smsSender: fakeSmsSender });
  expect(fourth).toEqual({ success: false, error: "RATE_LIMITED" });
  expect(fakeSmsSender.send).toHaveBeenCalledTimes(3); // the 4th never sent
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd apps/web && npx vitest run tests/send-otp.test.ts -t "4th OTP request"
```
Expected: FAIL — today there's no limit, all 4 succeed.

- [ ] **Step 3: Add the DB-backed throttle**

```typescript
const OTP_TTL_MINUTES = 5;
const RATE_LIMIT_WINDOW_MINUTES = 10;
const RATE_LIMIT_MAX_REQUESTS = 3;

export type SendOtpResult = { success: true; code?: string } | { success: false; error: "RATE_LIMITED" };

export async function sendOtp(
  phone: string,
  deps: { prisma: PrismaClient; smsSender: SmsSender; exposeCodeForTesting?: boolean }
): Promise<SendOtpResult> {
  const user = await deps.prisma.user.findUnique({ where: { phone } });
  if (!user || user.status === "inactive") {
    return { success: true };
  }

  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000);
  const recentCount = await deps.prisma.otpCode.count({
    where: { phone, createdAt: { gte: windowStart } },
  });
  if (recentCount >= RATE_LIMIT_MAX_REQUESTS) {
    return { success: false, error: "RATE_LIMITED" };
  }

  const code = generateOtpCode();
  const { hash, salt } = hashOtpCode(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await deps.prisma.otpCode.create({
    data: { phone, codeHash: hash, salt, expiresAt },
  });

  await deps.smsSender.send(phone, `Your School IS verification code is ${code}`);

  return deps.exposeCodeForTesting ? { success: true, code } : { success: true };
}
```

- [ ] **Step 4: Update the API route to handle the new `success: false` branch**

```typescript
const result = await sendOtp(phone, {
  prisma,
  smsSender: new ConsoleSmsSender(),
  exposeCodeForTesting: process.env.EXPOSE_OTP_FOR_TESTING === "true",
});
if (!result.success) {
  return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
}
return NextResponse.json({ success: true, code: result.code });
```

- [ ] **Step 5: Run the test to confirm it passes**

```bash
cd apps/web && npx vitest run tests/send-otp.test.ts -t "4th OTP request"
```
Expected: PASS

- [ ] **Step 6: Run the full suite, typecheck, build**

```bash
cd apps/web && npm test && npx tsc --noEmit && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/auth/send-otp.ts apps/web/src/app/api/auth/send-otp apps/web/tests/send-otp.test.ts
git commit -m "fix: rate-limit OTP requests per phone number using existing OtpCode timestamps"
```

**Explicitly out of scope:** this only rate-limits by phone number, not by IP — an attacker rotating through many phone numbers from one IP is still unthrottled. IP-based limiting needs request-level infrastructure (middleware or an edge-level limiter) that's a bigger, separate decision. This task closes the specific "unlimited OTP requests for one phone" gap the audit named.

---

### Task 4: Fix the attendance "today" timezone bug

**Files:**
- Create: `apps/web/src/lib/date-utils.ts` (or extend if a similar shared date-utils file already exists — check `find apps/web/src/lib -iname "*date*"` first)
- Modify: `apps/web/src/lib/attendance.ts:108`, `apps/web/src/lib/dashboard/overview.ts` (`startOfToday()` and its second use), `apps/web/src/lib/parent/overview.ts:97-98`, `apps/web/src/components/attendance/AttendanceView.tsx:28`
- Test: `apps/web/tests/date-utils.test.ts` (new), plus whichever existing attendance tests exercise the "today" boundary

**Interfaces:**
- New exported function `getSchoolLocalToday(): string` returning `YYYY-MM-DD` for the current moment in `Asia/Kolkata`, to replace every `new Date().toISOString().slice(0, 10)` "get today" call site listed above. (Non-attendance uses of the same string pattern elsewhere in the codebase — e.g. formatting an already-known stored date — are NOT in scope; only call sites computing "what day is it right now" are.)

- [ ] **Step 1: Write the failing test for the new helper**

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { getSchoolLocalToday } from "../src/lib/date-utils";

describe("getSchoolLocalToday", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the IST calendar date, not the UTC one, for a time that has crossed midnight IST but not UTC", () => {
    // 2026-08-16T19:00:00Z is 2026-08-17T00:30:00 IST (UTC+5:30) -- already tomorrow in IST,
    // but toISOString().slice(0,10) on the raw UTC Date would incorrectly say "2026-08-16".
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-16T19:00:00.000Z"));
    expect(getSchoolLocalToday()).toBe("2026-08-17");
  });

  it("returns the same calendar date as UTC when well within the UTC day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-16T08:00:00.000Z")); // 13:30 IST, same calendar day
    expect(getSchoolLocalToday()).toBe("2026-08-16");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd apps/web && npx vitest run tests/date-utils.test.ts
```
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Implement the helper**

```typescript
const SCHOOL_TIMEZONE = "Asia/Kolkata";

/**
 * Returns today's date as YYYY-MM-DD in the school's local timezone,
 * not the server's (which is UTC in most deployments). Use this for any
 * "what day is it right now" logic -- attendance edit windows, default
 * date pickers, "today" comparisons -- instead of
 * `new Date().toISOString().slice(0, 10)`, which is wrong for roughly
 * 5.5 hours of every IST day.
 */
export function getSchoolLocalToday(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: SCHOOL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date()); // en-CA locale formats as YYYY-MM-DD
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
cd apps/web && npx vitest run tests/date-utils.test.ts
```
Expected: PASS

- [ ] **Step 5: Replace each "get today" call site**

In `apps/web/src/lib/attendance.ts:108`, replace `const today = new Date().toISOString().slice(0, 10);` with `const today = getSchoolLocalToday();` (add the import). Read the surrounding function first to confirm this is genuinely a "what day is it now" check (used to lock the teacher edit window to today) and not something else.

In `apps/web/src/lib/dashboard/overview.ts`, find `startOfToday()` and its two use sites (~line 91, ~line 215) — read the function definition, since it likely constructs a `Date` object rather than a string; if so, either reimplement it to anchor on `getSchoolLocalToday()` (parse the returned string back into a `Date` at midnight) or add a sibling helper. Read the actual current code before deciding which — the brief's job here is the string-returning cases; if `overview.ts` needs a `Date`-returning variant, add `export function getSchoolLocalTodayStart(): Date { return new Date(getSchoolLocalToday() + "T00:00:00.000Z"); }` to the same `date-utils.ts` file and use that instead, matching whatever shape the existing `startOfToday()`/`addDays()` calls in that file expect.

In `apps/web/src/lib/parent/overview.ts:97-98`, same substitution — read the surrounding attendance-calendar-cell-matching logic first to confirm it's a "today" computation, not formatting a stored date.

In `apps/web/src/components/attendance/AttendanceView.tsx:28`, this is a **client-side** React component — `Intl.DateTimeFormat` works fine in the browser too, so the same `getSchoolLocalToday()` function can be imported directly (it has no server-only dependencies). Replace the same pattern there.

- [ ] **Step 6: Run the full suite, typecheck, build**

```bash
cd apps/web && npm test && npx tsc --noEmit && npm run build
```
Pay particular attention to any attendance test that hardcodes a UTC-boundary date and might now behave differently — that's expected if the old behavior was the bug, but confirm each such test's assertion is updated to the *correct* (IST) expectation, not just made to pass by coincidence.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/date-utils.ts apps/web/src/lib/attendance.ts apps/web/src/lib/dashboard/overview.ts apps/web/src/lib/parent/overview.ts apps/web/src/components/attendance/AttendanceView.tsx apps/web/tests/date-utils.test.ts
git commit -m "fix: compute 'today' in school-local (IST) time instead of server UTC"
```

---

### Task 5: Validate and normalize phone numbers on student/staff creation and edit

**Files:**
- Create: `apps/web/src/lib/phone.ts`
- Modify: `apps/web/src/lib/school-setup/students.ts` (parent phone fields, lines ~137, ~178, ~274, ~362), `apps/web/src/lib/school-setup/staff.ts` (lines ~56, ~125)
- Test: `apps/web/tests/phone.test.ts` (new), plus extend `students-lib.test.ts` and the staff equivalent test file

**Interfaces:**
- New exported function `isValidPhone(phone: string): boolean` — a loose E.164-style check (`^\+?[1-9]\d{7,14}$`), permissive enough not to reject the existing test fixtures (all use `+1555xxxxxxx`-shaped numbers) or real Indian numbers (`+91` + 10 digits), but rejecting empty/whitespace-only/obviously-malformed input.
- New exported function `normalizePhone(phone: string): string` — trims whitespace only (do NOT attempt to rewrite `09876543210` → `+919876543210` or similar country-code inference in this task — that requires knowing the school's country, which isn't modeled anywhere; trimming closes the "`'   '` counts as a different number than `''`" class of bug without guessing at intent).
- `createStudent`, `editStudent`, `createStaff`, `editStaff` (confirm exact function names in `staff.ts` before writing this) all gain a new error variant `{ ok: false; error: "INVALID_PHONE" }`, checked before any existing phone-uniqueness lookup.

- [ ] **Step 1: Write the failing tests for the validator**

```typescript
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
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd apps/web && npx vitest run tests/phone.test.ts
```
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```typescript
const PHONE_PATTERN = /^\+?[1-9]\d{7,14}$/;

export function isValidPhone(phone: string): boolean {
  return PHONE_PATTERN.test(phone.trim());
}

export function normalizePhone(phone: string): string {
  return phone.trim();
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
cd apps/web && npx vitest run tests/phone.test.ts
```
Expected: PASS

- [ ] **Step 5: Write the failing integration test for `createStudent`**

```typescript
it("rejects createStudent when a parent phone is malformed", async () => {
  const school = await prisma.school.create({ data: { name: "Test School" } });
  const year = await createActiveYear(prisma, school.id);
  const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 3", section: "A" });

  const result = await createStudent(prisma, school.id, year.id, {
    name: "New Student",
    dob: "2016-01-01",
    classId: klass.id,
    admissionNo: "SCH-INVALID-PHONE",
    parents: [{ relationship: "Mother", name: "A Parent", phone: "not-a-phone" }],
  });

  expect(result).toMatchObject({ ok: false, error: "INVALID_PHONE" });
});
```

- [ ] **Step 6: Run it to confirm it fails, then wire the check into `createStudent`/`editStudent`**

Add `import { isValidPhone, normalizePhone } from "../phone";` to `students.ts`. In `createStudent`, before the existing `PHONE_WRONG_ROLE`/`PHONE_BELONGS_TO_ANOTHER_SCHOOL` loop (the one added in the Phase 1 plan), add:

```typescript
for (const parentInput of input.parents) {
  if (!isValidPhone(parentInput.phone)) return { ok: false, error: "INVALID_PHONE" };
}
```

and normalize before storing: wherever `parentInput.phone` is passed into `tx.user.create`/`tx.user.update`/`findUnique`, use `normalizePhone(parentInput.phone)` instead of the raw value (apply this consistently — normalize once at the top of each parent-processing loop into a local variable, then use that variable everywhere in the loop, rather than calling normalize repeatedly). Add the matching `INVALID_PHONE` variant to `CreateStudentResult`.

Apply the identical pattern to `editStudent`'s parent-processing loop, adding `INVALID_PHONE` to `EditStudentResult`.

- [ ] **Step 7: Run the test to confirm it passes**

```bash
cd apps/web && npx vitest run tests/students-lib.test.ts -t "malformed"
```
Expected: PASS

- [ ] **Step 8: Repeat Steps 5-7 for `staff.ts`**

Read `apps/web/src/lib/school-setup/staff.ts` in full first to find the actual create/edit function names and their exact phone-handling call sites (the verification pass found phone at lines ~56 and ~125 but didn't name the enclosing functions — confirm before writing). Add the same `isValidPhone`/`normalizePhone` treatment, the same new `INVALID_PHONE` error variant, and a matching integration test in whichever test file covers staff creation/editing (`find apps/web/tests -iname "*staff*"`).

- [ ] **Step 9: Update API route error mappings**

Add `INVALID_PHONE` branches to the students and staff API routes' error-to-HTTP mappings, following the existing convention for `PHONE_WRONG_ROLE`/`PHONE_BELONGS_TO_ANOTHER_SCHOOL` in the same files.

- [ ] **Step 10: Run the full suite, typecheck, build**

```bash
cd apps/web && npm test && npx tsc --noEmit && npm run build
```

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/lib/phone.ts apps/web/src/lib/school-setup/students.ts apps/web/src/lib/school-setup/staff.ts apps/web/src/app/api/students apps/web/src/app/api/staff apps/web/tests/phone.test.ts apps/web/tests/students-lib.test.ts
git commit -m "fix: validate and normalize phone numbers on student/staff create and edit"
```

---

### Task 6: Add pagination to `listStudents` and `listStaff`

**Files:**
- Modify: `apps/web/src/lib/school-setup/students.ts` (`listStudents`), `apps/web/src/lib/school-setup/staff.ts` (`listStaff`), `apps/web/src/app/api/students/route.ts`, `apps/web/src/app/api/staff/route.ts`
- Test: `apps/web/tests/students-lib.test.ts`, staff equivalent

**Design choice, stated plainly:** make pagination **additive and optional** — when the caller doesn't pass `page`/`pageSize`, both functions keep returning every row (today's behavior), so no existing caller breaks. This closes "there's no way to paginate" without forcing every call site to adopt it in this task; wiring the dashboard UI to actually use pagination (page-size selector, next/prev controls) is a separate, larger frontend task not attempted here.

**Interfaces:**
- `listStudents(prisma, schoolId, options?: { page?: number; pageSize?: number })` → return type changes from `Promise<StudentSummary[]>` to `Promise<{ students: StudentSummary[]; total: number }>` when `options` is provided, but to avoid a breaking change for every existing caller, instead: **keep the return type as `StudentSummary[]` always**, and make pagination purely a `take`/`skip` slice — callers that want the total count issue a separate `prisma.student.count({ where: { schoolId } })` themselves (this keeps every existing call site, including every existing test, compiling unchanged). Same pattern for `listStaff`.

- [ ] **Step 1: Write the failing test**

```typescript
it("listStudents respects page/pageSize and returns a smaller slice", async () => {
  const school = await prisma.school.create({ data: { name: "Test School" } });
  const year = await createActiveYear(prisma, school.id);
  const klass = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, name: "Grade 3", section: "A" });
  for (let i = 0; i < 5; i++) {
    await createStudent(prisma, school.id, year.id, {
      name: `Student ${i}`,
      dob: "2016-01-01",
      classId: klass.id,
      admissionNo: `PAGE-${i}`,
      parents: [{ relationship: "Mother", name: "A Parent", phone: `+1555000${1000 + i}` }],
    });
  }

  const firstPage = await listStudents(prisma, school.id, { page: 1, pageSize: 2 });
  const secondPage = await listStudents(prisma, school.id, { page: 2, pageSize: 2 });

  expect(firstPage).toHaveLength(2);
  expect(secondPage).toHaveLength(2);
  expect(firstPage.map((s) => s.admissionNo)).not.toEqual(secondPage.map((s) => s.admissionNo));

  const allStudents = await listStudents(prisma, school.id); // no options -- unchanged behavior
  expect(allStudents.length).toBeGreaterThanOrEqual(5);
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd apps/web && npx vitest run tests/students-lib.test.ts -t "page/pageSize"
```
Expected: FAIL — `listStudents` doesn't accept a third argument today.

- [ ] **Step 3: Add optional pagination**

```typescript
export async function listStudents(
  prisma: PrismaClient,
  schoolId: number,
  options?: { page?: number; pageSize?: number }
): Promise<StudentSummary[]> {
  const activeYear = await prisma.academicYear.findFirst({ where: { schoolId, status: "active" } });
  const students = await prisma.student.findMany({
    where: { schoolId },
    include: {
      parentLinks: { include: { parent: true } },
      enrollments: {
        where: activeYear ? { academicYearId: activeYear.id } : { id: -1 },
        include: { class: { include: { grade: true } } },
      },
    },
    orderBy: { name: "asc" },
    ...(options?.page && options?.pageSize
      ? { skip: (options.page - 1) * options.pageSize, take: options.pageSize }
      : {}),
  });
  // ... rest of the function (the .map(...) that builds StudentSummary[]) unchanged
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
cd apps/web && npx vitest run tests/students-lib.test.ts -t "page/pageSize"
```
Expected: PASS

- [ ] **Step 5: Repeat Steps 1-4 for `listStaff`**, with the identical `options?: { page?: number; pageSize?: number }` shape and a matching test.

- [ ] **Step 6: Wire the API routes to accept optional query params**

In `apps/web/src/app/api/students/route.ts`'s `GET` handler, read `page`/`pageSize` from `new URL(request.url).searchParams` (both optional, parse with `Number(...)` and treat `NaN`/absent as "no pagination" — i.e., pass `undefined` through rather than `{page: NaN}`), and pass them through to `listStudents`. Same for the staff route.

- [ ] **Step 7: Run the full suite, typecheck, build**

```bash
cd apps/web && npm test && npx tsc --noEmit && npm run build
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/school-setup/students.ts apps/web/src/lib/school-setup/staff.ts apps/web/src/app/api/students/route.ts apps/web/src/app/api/staff/route.ts apps/web/tests/students-lib.test.ts
git commit -m "feat: add optional pagination to listStudents and listStaff"
```

---

### Task 7: Add loading and error boundaries

**Files:**
- Create: `apps/web/src/app/dashboard/loading.tsx`, `apps/web/src/app/dashboard/error.tsx`, `apps/web/src/app/parent/loading.tsx`, `apps/web/src/app/parent/error.tsx`, `apps/web/src/app/not-found.tsx`

**No test in the traditional sense** — these are Next.js App Router convention files with no exported function to unit-test; verification is `npm run build` succeeding and a manual check that the files are picked up (Next.js's build output lists them). Read `apps/web/src/app/dashboard/layout.tsx` and `apps/web/src/app/parent/layout.tsx` first to match existing styling conventions (Tailwind classes, color tokens) so these don't look visually foreign.

- [ ] **Step 1: Read the existing dashboard and parent layouts for styling conventions**

```bash
cd apps/web && cat src/app/dashboard/layout.tsx src/app/parent/layout.tsx
```

- [ ] **Step 2: Create `apps/web/src/app/dashboard/loading.tsx`**

```typescript
export default function DashboardLoading() {
  return (
    <div className="flex h-full min-h-[50vh] items-center justify-center">
      <div className="text-sm text-gray-500">Loading…</div>
    </div>
  );
}
```
Adjust the class names to match whatever utility classes `dashboard/layout.tsx` actually uses for spacing/color (e.g. if the project uses `text-muted-foreground` or a specific gray shade elsewhere, match that instead of guessing).

- [ ] **Step 3: Create `apps/web/src/app/dashboard/error.tsx`**

This one MUST be a Client Component (`"use client"` directive required by Next.js for `error.tsx` files):

```typescript
"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-4">
      <p className="text-sm text-gray-600">Something went wrong loading this page.</p>
      <button
        onClick={reset}
        className="rounded border px-4 py-2 text-sm hover:bg-gray-50"
      >
        Try again
      </button>
    </div>
  );
}
```
Do not render `error.message` directly to the user — Next.js already strips sensitive details from `error` in production builds for uncaught server errors, but don't second-guess that by adding your own message interpolation here.

- [ ] **Step 4: Repeat Steps 2-3 for `apps/web/src/app/parent/loading.tsx` and `apps/web/src/app/parent/error.tsx`**, matching `parent/layout.tsx`'s styling instead.

- [ ] **Step 5: Create `apps/web/src/app/not-found.tsx`** (root-level, applies app-wide)

```typescript
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <p className="text-lg font-medium">Page not found</p>
      <Link href="/" className="text-sm text-blue-600 hover:underline">
        Go home
      </Link>
    </div>
  );
}
```

- [ ] **Step 6: Build and manually verify the files are recognized**

```bash
cd apps/web && npm run build 2>&1 | grep -E "loading|error|not-found"
```
Next.js's build output lists special files per route; confirm `dashboard`, `parent`, and the root each show the new files being picked up. Run `npm test` too, in case any existing test snapshots page structure.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/loading.tsx apps/web/src/app/dashboard/error.tsx apps/web/src/app/parent/loading.tsx apps/web/src/app/parent/error.tsx apps/web/src/app/not-found.tsx
git commit -m "feat: add loading, error, and not-found boundaries for dashboard and parent routes"
```

---

### Task 8: Batch the dashboard's N+1 attendance queries

**Files:**
- Modify: `apps/web/src/lib/dashboard/overview.ts` (the `classPerformance` loop at ~lines 180-194, and the `attendanceTrend` nested loop at ~lines 200-221)
- Test: whichever test file covers `getDashboardOverview` or similar (check `find apps/web/tests -iname "*overview*"` or `*dashboard*`)

Current code (verified):
```typescript
const classPerformance: ClassPerformanceEntry[] = [];
for (const klass of classes) {
  const records = await prisma.attendance.findMany({
    where: {
      date: { gte: thirtyDaysAgo, lt: todayEnd },
      student: { enrollments: { some: { classId: klass.id, academicYearId, status: "active" } } },
    },
    select: { status: true },
  });
  classPerformance.push({
    classId: klass.id,
    name: klass.gradeName,
    section: klass.section,
    attendancePercent: attendancePercent(records),
  });
}
// ... then a second, nested loop: 5 days x up to 3 classes = up to 15 more sequential queries
```

**Interfaces:** no external signature changes — `getDashboardOverview`'s return type and the two loops' final output (`classPerformance`, `attendanceTrend`) stay identical; only the query strategy changes from N sequential queries to 1.

- [ ] **Step 1: Confirm current test coverage exists for the values these loops produce**

```bash
cd apps/web && grep -rln "classPerformance\|attendanceTrend" tests/
```
If a test already asserts on these fields' values for a multi-class fixture, that test is your regression guard — no new test is strictly required for this task, since it's a pure performance refactor with no behavior change. If no such test exists, write one first (seed 2-3 classes with distinct attendance records over the last 30 days, call `getDashboardOverview`, assert `classPerformance` has the right `attendancePercent` per class) before refactoring, so you have a correctness guard.

- [ ] **Step 2: Batch the `classPerformance` loop into one query**

Replace the loop with a single query that fetches every relevant attendance record across all classes at once, including which class each belongs to, then group in JS:

```typescript
const classIdSet = new Set(classes.map((k) => k.id));
const allAttendanceRecords = await prisma.attendance.findMany({
  where: {
    date: { gte: thirtyDaysAgo, lt: todayEnd },
    student: { enrollments: { some: { classId: { in: [...classIdSet] }, academicYearId, status: "active" } } },
  },
  select: {
    status: true,
    student: {
      select: {
        enrollments: {
          where: { classId: { in: [...classIdSet] }, academicYearId, status: "active" },
          select: { classId: true },
          take: 1,
        },
      },
    },
  },
});

const recordsByClassId = new Map<number, { status: string }[]>();
for (const record of allAttendanceRecords) {
  const classId = record.student.enrollments[0]?.classId;
  if (classId === undefined) continue;
  const bucket = recordsByClassId.get(classId) ?? [];
  bucket.push({ status: record.status });
  recordsByClassId.set(classId, bucket);
}

const classPerformance: ClassPerformanceEntry[] = classes.map((klass) => ({
  classId: klass.id,
  name: klass.gradeName,
  section: klass.section,
  attendancePercent: attendancePercent(recordsByClassId.get(klass.id) ?? []),
}));
```

- [ ] **Step 3: Batch the `attendanceTrend` nested loop the same way**

Fetch the full 5-day window for `trendClasses` in one query (not per-day, not per-class), then bucket by `(day, classId)` in JS:

```typescript
const trendClassIds = trendClasses.map((c) => c.classId);
const trendStart = addDays(todayStart, -4);
const trendRecords = await prisma.attendance.findMany({
  where: {
    date: { gte: trendStart, lt: todayEnd },
    student: { enrollments: { some: { classId: { in: trendClassIds }, academicYearId, status: "active" } } },
  },
  select: {
    date: true,
    status: true,
    student: {
      select: {
        enrollments: {
          where: { classId: { in: trendClassIds }, academicYearId, status: "active" },
          select: { classId: true },
          take: 1,
        },
      },
    },
  },
});

const trendBuckets = new Map<string, { status: string }[]>(); // key: `${dateStr}:${classId}`
for (const record of trendRecords) {
  const classId = record.student.enrollments[0]?.classId;
  if (classId === undefined) continue;
  const key = `${record.date.toISOString().slice(0, 10)}:${classId}`;
  const bucket = trendBuckets.get(key) ?? [];
  bucket.push({ status: record.status });
  trendBuckets.set(key, bucket);
}

const attendanceTrend: AttendanceTrendPoint[] = [];
for (let i = 4; i >= 0; i--) {
  const day = addDays(todayStart, -i);
  const dateStr = day.toISOString().slice(0, 10);
  for (const klass of trendClasses) {
    const records = trendBuckets.get(`${dateStr}:${klass.classId}`) ?? [];
    if (records.length === 0) continue;
    attendanceTrend.push({
      date: dateStr,
      classId: klass.classId,
      className: `${klass.name} ${klass.section}`,
      percent: attendancePercent(records),
    });
  }
}
```

- [ ] **Step 4: Run the regression test from Step 1 to confirm identical output**

```bash
cd apps/web && npx vitest run <the test file identified in step 1>
```
Expected: PASS with the same `classPerformance`/`attendanceTrend` values as before the refactor — this is the critical check, since a batching bug would silently produce wrong numbers rather than an error.

- [ ] **Step 5: Run the full suite, typecheck, build**

```bash
cd apps/web && npm test && npx tsc --noEmit && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/dashboard/overview.ts apps/web/tests/
git commit -m "perf: batch dashboard attendance queries to eliminate N+1 pattern"
```

---

### Task 9: Close the two remaining tenant-check gaps (editTimetableEntry subject, editClass grade/year)

**Files:**
- Modify: `apps/web/src/lib/timetable.ts` (`editTimetableEntry`, lines ~114-137), `apps/web/src/lib/school-setup/classes.ts` (`editClass`, lines ~73-96)
- Test: `apps/web/tests/timetable-lib.test.ts`, `apps/web/tests/classes-lib.test.ts` (check exact filename with `find apps/web/tests -iname "*class*"`)

This closes the narrower, re-verified remainder of the audit's "update paths skip tenant checks" finding — the `createTimetableEntry`/`createClass` sides were already found to validate correctly; only these two edit-path gaps remain.

**Interfaces:**
- `EditTimetableEntryResult` gains `{ ok: false; error: "INVALID_SUBJECT" }` (mirroring `createTimetableEntry`'s existing `INVALID_SUBJECT`).
- `EditClassResult` gains `{ ok: false; error: "INVALID_GRADE" }` and `{ ok: false; error: "INVALID_YEAR" }` (mirroring `createClass`'s existing `CreateClassResult` error names exactly, for consistency).

- [ ] **Step 1: Write the failing test for `editTimetableEntry`**

```typescript
it("rejects editTimetableEntry when the new subjectId doesn't belong to the entry's class's grade", async () => {
  const school = await prisma.school.create({ data: { name: "Test School" } });
  const year = await createActiveYear(prisma, school.id);
  const gradeA = await prisma.grade.create({ data: { schoolId: school.id, name: "Grade A" } });
  const gradeB = await prisma.grade.create({ data: { schoolId: school.id, name: "Grade B" } });
  const classA = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, gradeId: gradeA.id, section: "A" });
  const subjectInGradeB = await prisma.subject.create({ data: { gradeId: gradeB.id, name: "Foreign Subject" } });
  const period = await prisma.period.create({ data: { schoolId: school.id, order: 1, label: "Period 1", startTime: "09:00", endTime: "09:45" } });
  const subjectInGradeA = await prisma.subject.create({ data: { gradeId: gradeA.id, name: "Native Subject" } });

  const created = await createTimetableEntry(prisma, {
    schoolId: school.id, academicYearId: year.id, classId: classA.id,
    dayOfWeek: 1, periodId: period.id, subjectId: subjectInGradeA.id,
  });
  if (!created.ok) throw new Error("setup failed");

  const result = await editTimetableEntry(prisma, {
    entryId: created.id,
    schoolId: school.id,
    fields: { subjectId: subjectInGradeB.id },
  });

  expect(result).toMatchObject({ ok: false, error: "INVALID_SUBJECT" });
});
```

> Adjust field names/helper signatures (`createClass`'s params, `Grade`/`Subject`/`Period` model field names) to match what's actually in this codebase — check `apps/web/tests/timetable-lib.test.ts`'s existing setup code for the exact factory pattern already in use rather than guessing.

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd apps/web && npx vitest run tests/timetable-lib.test.ts -t "doesn't belong to the entry's class's grade"
```
Expected: FAIL — today this silently succeeds.

- [ ] **Step 3: Add the check to `editTimetableEntry`**

```typescript
export type EditTimetableEntryResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "INVALID_SUBJECT" }
  | { ok: false; error: "INVALID_TEACHER" };

export async function editTimetableEntry(
  prisma: PrismaClient,
  params: { entryId: number; schoolId: number; fields: { subjectId?: number; teacherUserId?: number | null } }
): Promise<EditTimetableEntryResult> {
  const entry = await prisma.timetableEntry.findUnique({ where: { id: params.entryId }, include: { class: true } });
  if (!entry || entry.class.schoolId !== params.schoolId) return { ok: false, error: "NOT_FOUND" };

  const data: { subjectId?: number; teacherUserId?: number | null } = {};
  if (params.fields.subjectId !== undefined) {
    const subject = await prisma.subject.findFirst({
      where: { id: params.fields.subjectId, gradeId: entry.class.gradeId },
    });
    if (!subject) return { ok: false, error: "INVALID_SUBJECT" };
    data.subjectId = params.fields.subjectId;
  }
  if (params.fields.teacherUserId !== undefined) {
    // ... unchanged teacher-validation block
  }

  await prisma.timetableEntry.update({ where: { id: params.entryId }, data });
  return { ok: true };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
cd apps/web && npx vitest run tests/timetable-lib.test.ts -t "doesn't belong to the entry's class's grade"
```
Expected: PASS

- [ ] **Step 5: Write the failing test for `editClass`**

```typescript
it("rejects editClass when the new gradeId belongs to a different school", async () => {
  const schoolA = await prisma.school.create({ data: { name: "School A" } });
  const schoolB = await prisma.school.create({ data: { name: "School B" } });
  const yearA = await createActiveYear(prisma, schoolA.id);
  const gradeA = await prisma.grade.create({ data: { schoolId: schoolA.id, name: "Grade A" } });
  const gradeB = await prisma.grade.create({ data: { schoolId: schoolB.id, name: "Grade B" } }); // different school
  const classA = await createClass(prisma, schoolA.id, { gradeId: gradeA.id, section: "A", academicYearId: yearA.id });
  if (!classA.ok) throw new Error("setup failed");

  const result = await editClass(prisma, {
    classId: classA.class.id,
    schoolId: schoolA.id,
    fields: { gradeId: gradeB.id },
  });

  expect(result).toMatchObject({ ok: false, error: "INVALID_GRADE" });
});
```

- [ ] **Step 6: Run it to confirm it fails**

```bash
cd apps/web && npx vitest run tests/classes-lib.test.ts -t "different school"
```
Expected: FAIL — today `prisma.class.update` silently repoints the class at another school's grade.

- [ ] **Step 7: Add the check to `editClass`**

```typescript
export type EditClassResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "DUPLICATE" }
  | { ok: false; error: "INVALID_GRADE" }
  | { ok: false; error: "INVALID_YEAR" };

export async function editClass(
  prisma: PrismaClient,
  params: { classId: number; schoolId: number; fields: { gradeId?: number; section?: string; academicYearId?: number } }
): Promise<EditClassResult> {
  const klass = await prisma.class.findFirst({ where: { id: params.classId, schoolId: params.schoolId } });
  if (!klass) return { ok: false, error: "NOT_FOUND" };

  if (params.fields.gradeId !== undefined) {
    const grade = await prisma.grade.findFirst({ where: { id: params.fields.gradeId, schoolId: params.schoolId } });
    if (!grade) return { ok: false, error: "INVALID_GRADE" };
  }
  if (params.fields.academicYearId !== undefined) {
    const year = await prisma.academicYear.findFirst({ where: { id: params.fields.academicYearId, schoolId: params.schoolId } });
    if (!year) return { ok: false, error: "INVALID_YEAR" };
  }

  const nextGradeId = params.fields.gradeId ?? klass.gradeId;
  const nextSection = params.fields.section ?? klass.section;
  const nextYearId = params.fields.academicYearId ?? klass.academicYearId;
  const duplicate = await prisma.class.findFirst({
    where: { gradeId: nextGradeId, section: nextSection, academicYearId: nextYearId, id: { not: params.classId } },
  });
  if (duplicate) return { ok: false, error: "DUPLICATE" };

  try {
    await prisma.class.update({
      where: { id: params.classId },
      data: { gradeId: params.fields.gradeId, section: params.fields.section, academicYearId: params.fields.academicYearId },
    });
    return { ok: true };
  } catch (err) {
    if (isUniqueConstraintViolation(err)) return { ok: false, error: "DUPLICATE" };
    throw err;
  }
}
```

- [ ] **Step 8: Run the test to confirm it passes**

```bash
cd apps/web && npx vitest run tests/classes-lib.test.ts -t "different school"
```
Expected: PASS

- [ ] **Step 9: Update API route error mappings for both**

Add `INVALID_SUBJECT` to the timetable edit route's error mapping, and `INVALID_GRADE`/`INVALID_YEAR` to the class edit route's — both should already have a mapping for these exact error strings from their respective create-path routes; reuse the same status code/message convention.

- [ ] **Step 10: Run the full suite, typecheck, build**

```bash
cd apps/web && npm test && npx tsc --noEmit && npm run build
```

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/lib/timetable.ts apps/web/src/lib/school-setup/classes.ts apps/web/src/app/api/timetable apps/web/src/app/api/classes apps/web/tests/timetable-lib.test.ts apps/web/tests/classes-lib.test.ts
git commit -m "fix: validate tenant ownership on editTimetableEntry subject and editClass grade/year"
```

---

### Task 10: Detect teacher double-booking in the timetable

**Files:**
- Modify: `apps/web/src/lib/timetable.ts` (`createTimetableEntry`, `editTimetableEntry`)
- Test: `apps/web/tests/timetable-lib.test.ts`

**Design choice:** this is an application-level check, not a database constraint — a DB-level `@@unique([teacherUserId, dayOfWeek, periodId, academicYearId])` would be the more robust long-term fix (closes the race this app-level check alone can't), but `teacherUserId` is nullable (a slot can have no teacher assigned yet), and Postgres unique constraints treat `NULL` as distinct from every other `NULL` by default — meaning a DB-level unique constraint here would actually work correctly for this exact case (multiple `NULL` teacher rows don't collide), making it viable. This task does BOTH: the schema-level constraint (belt) and the application-level check with a clear error code (suspenders — surfaces a clean `TEACHER_ALREADY_BOOKED` error instead of a raw constraint-violation 500).

**Interfaces:**
- `CreateTimetableEntryResult` and `EditTimetableEntryResult` both gain `{ ok: false; error: "TEACHER_ALREADY_BOOKED" }`.
- New migration adding `@@unique([teacherUserId, dayOfWeek, periodId, academicYearId])` to `TimetableEntry`.

- [ ] **Step 1: Write the failing test**

```typescript
it("rejects creating a second timetable entry for the same teacher in the same slot, in a different class", async () => {
  const school = await prisma.school.create({ data: { name: "Test School" } });
  const year = await createActiveYear(prisma, school.id);
  const grade = await prisma.grade.create({ data: { schoolId: school.id, name: "Grade 5" } });
  const classA = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, gradeId: grade.id, section: "A" });
  const classB = await createClass(prisma, { schoolId: school.id, academicYearId: year.id, gradeId: grade.id, section: "B" });
  const subject = await prisma.subject.create({ data: { gradeId: grade.id, name: "Math" } });
  const period = await prisma.period.create({ data: { schoolId: school.id, order: 1, label: "Period 1", startTime: "09:00", endTime: "09:45" } });
  const teacher = await prisma.user.create({
    data: { schoolId: school.id, phone: "+15550004444", name: "A Teacher", role: "teacher" },
  });
  await prisma.classTeacher.create({
    data: { classId: classA.id, subjectId: subject.id, teacherUserId: teacher.id, academicYearId: year.id },
  });
  await prisma.classTeacher.create({
    data: { classId: classB.id, subjectId: subject.id, teacherUserId: teacher.id, academicYearId: year.id },
  });

  const firstBooking = await createTimetableEntry(prisma, {
    schoolId: school.id, academicYearId: year.id, classId: classA.id,
    dayOfWeek: 1, periodId: period.id, subjectId: subject.id, teacherUserId: teacher.id,
  });
  expect(firstBooking.ok).toBe(true);

  const clashingBooking = await createTimetableEntry(prisma, {
    schoolId: school.id, academicYearId: year.id, classId: classB.id,
    dayOfWeek: 1, periodId: period.id, subjectId: subject.id, teacherUserId: teacher.id,
  });
  expect(clashingBooking).toMatchObject({ ok: false, error: "TEACHER_ALREADY_BOOKED" });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd apps/web && npx vitest run tests/timetable-lib.test.ts -t "same teacher in the same slot"
```
Expected: FAIL — both bookings succeed today.

- [ ] **Step 3: Add the schema constraint**

```prisma
model TimetableEntry {
  // ... existing fields unchanged ...

  @@unique([classId, dayOfWeek, periodId, academicYearId])
  @@unique([teacherUserId, dayOfWeek, periodId, academicYearId])
  @@index([periodId])
  @@index([subjectId])
  @@index([teacherUserId])
  @@index([academicYearId])
}
```

```bash
cd apps/web && npx prisma migrate dev --name teacher_double_booking_constraint
```
If this fails due to migration-history drift on the local dev DB (a known pre-existing issue from earlier work in this repo), investigate the specific drift non-destructively before resorting to a reset — do not run `prisma migrate reset` without understanding what it would delete first.

- [ ] **Step 4: Add the application-level check in `createTimetableEntry`**

```typescript
export type CreateTimetableEntryResult =
  | { ok: true; id: number }
  | { ok: false; error: "INVALID_CLASS" }
  | { ok: false; error: "INVALID_DAY" }
  | { ok: false; error: "INVALID_SUBJECT" }
  | { ok: false; error: "INVALID_TEACHER" }
  | { ok: false; error: "TEACHER_ALREADY_BOOKED" }
  | { ok: false; error: "DUPLICATE_SLOT" };

// ... inside createTimetableEntry, after the existing teacherUserId/classTeacher check, before the try/create:
if (params.teacherUserId !== undefined) {
  const clash = await prisma.timetableEntry.findFirst({
    where: {
      teacherUserId: params.teacherUserId,
      dayOfWeek: params.dayOfWeek,
      periodId: params.periodId,
      academicYearId: params.academicYearId,
    },
  });
  if (clash) return { ok: false, error: "TEACHER_ALREADY_BOOKED" };
}

try {
  const created = await prisma.timetableEntry.create({ /* ... unchanged ... */ });
  return { ok: true, id: created.id };
} catch (err) {
  if (isUniqueConstraintViolation(err)) {
    // Could be either unique constraint -- check which one to return the right error.
    const target = uniqueConstraintTarget(err); // import from "./school-setup/prisma-errors" if not already imported
    if (target?.includes("teacherUserId")) return { ok: false, error: "TEACHER_ALREADY_BOOKED" };
    return { ok: false, error: "DUPLICATE_SLOT" };
  }
  throw err;
}
```
The pre-check closes the common case cleanly; the catch-block fallback closes the race between two concurrent creates that both pass the pre-check (mirroring the belt-and-suspenders pattern already used elsewhere in this codebase, e.g. `createStudent`'s `uniqueConstraintTarget` handling).

- [ ] **Step 5: Add the identical clash check to `editTimetableEntry`** when `teacherUserId` is being changed (inside the existing `if (params.fields.teacherUserId !== undefined && params.fields.teacherUserId !== null)` block, alongside the existing `classTeacher` link check), excluding the entry being edited itself from the clash query (`id: { not: params.entryId }`).

- [ ] **Step 6: Run the test to confirm it passes**

```bash
cd apps/web && npx vitest run tests/timetable-lib.test.ts -t "same teacher in the same slot"
```
Expected: PASS

- [ ] **Step 7: Apply the migration to the test DB too**

```bash
cd apps/web && DATABASE_URL="postgresql://school_is:school_is@localhost:5432/school_is_test" DIRECT_URL="postgresql://school_is:school_is@localhost:5432/school_is_test" npx prisma migrate deploy
```

- [ ] **Step 8: Run the full suite, typecheck, build**

```bash
cd apps/web && npm test && npx tsc --noEmit && npm run build
```

- [ ] **Step 9: Update API route error mappings**

Add `TEACHER_ALREADY_BOOKED` to both the create and edit timetable-entry routes' error mappings — 409 is the conventional status code for this kind of conflict, matching the convention already used for `DUPLICATE_SLOT`.

- [ ] **Step 10: Commit**

```bash
git add apps/web/prisma/schema.prisma apps/web/prisma/migrations apps/web/src/lib/timetable.ts apps/web/src/app/api/timetable apps/web/tests/timetable-lib.test.ts
git commit -m "fix: detect and reject teacher double-booking in the timetable"
```

---

## What this plan does not cover

- **IP-based rate limiting** (Task 3 only covers per-phone throttling) — needs request-level infrastructure.
- **No room/venue concept** in the timetable — the audit notes room clashes "can't even be represented" since no such model exists. A bigger feature, not a bug fix.
- **Per-school timezone configurability** (Task 4 hardcodes IST) — would need a `School.timezone` column and updating every "today" call site to read it.
- Everything in the original audit's Product Gaps section (bulk CSV import, audit log, DPDP consent/erasure, payment gateway, report cards, etc.) — features, not bugs, tracked separately.
