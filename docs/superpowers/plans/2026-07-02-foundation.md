# Foundation (Schema, Auth, RBAC) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared foundation (Postgres schema, phone+OTP auth, RBAC scaffolding, seed fixtures) that the web dashboard and parent mobile app sub-projects will both build on top of.

**Architecture:** A Next.js (TypeScript) app under `apps/web` hosts the Prisma-backed Postgres schema and the shared API layer. Auth is custom (not a third-party auth provider) so we control the `role`/`schoolId` JWT claims precisely: an OTP is generated, hashed, and stored; on verification a signed JWT session token is issued; a `requireRole` helper gates access per role. Every table carries `schoolId` (directly or via a foreign key) even though there is one school today, so Phase 3 multi-tenancy is a query filter, not a migration.

**Tech Stack:** Next.js 14 (App Router) + TypeScript, Prisma ORM, PostgreSQL 16 (local via Docker for dev), `jsonwebtoken`, Node's built-in `crypto` for OTP hashing, Vitest for tests.

## Global Constraints

- Roles are exactly: `parent`, `teacher`, `admin`, `accountant` (per spec section 5).
- Every table carries `schoolId` (directly or via FK) from day one (per spec section 5/6).
- Auth is phone number + OTP for all roles (per spec section 5) — no password flow.
- `parent_student` and `class_teacher` are many-to-many join tables and are the basis for RBAC scoping (per spec section 6).
- No online payment gateway, no SMS/WhatsApp provider integration in this plan — OTP delivery uses a swappable `SmsSender` interface with a console-logging implementation for now; real Twilio/WhatsApp wiring is a later sub-project (Notifications).

---

### Task 1: Project scaffolding

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.js`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/docker-compose.yml`
- Create: `apps/web/.env.example`
- Create: `apps/web/.env`
- Create: `apps/web/.env.test`
- Create: `apps/web/.gitignore`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/vitest.setup.ts`

**Interfaces:**
- Produces: a running Next.js app at `apps/web`, a local Postgres reachable at `postgresql://school_is:school_is@localhost:5432/school_is` (dev) and `.../school_is_test` (test), and a Vitest test runner wired to load `.env.test`.

- [ ] **Step 1: Create the app directory and initialize npm**

```bash
mkdir -p "apps/web/src/app"
cd apps/web && npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install next@14 react@18 react-dom@18 @prisma/client jsonwebtoken
npm install -D typescript @types/node @types/react @types/jsonwebtoken prisma vitest tsx dotenv
```

- [ ] **Step 3: Write `package.json` scripts**

Replace the `"scripts"` block in `apps/web/package.json` with:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "test": "vitest run",
    "prisma:migrate": "prisma migrate dev",
    "prisma:migrate:test": "dotenv -e .env.test -- prisma migrate deploy",
    "seed": "tsx prisma/seed.ts"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

- [ ] **Step 4: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "esnext"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["**/*.ts", "**/*.tsx", "prisma/**/*.ts", "tests/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 5: Write `next.config.js`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {};
module.exports = nextConfig;
```

- [ ] **Step 6: Write a minimal app shell**

`apps/web/src/app/layout.tsx`:

```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

`apps/web/src/app/page.tsx`:

```tsx
export default function Home() {
  return <main>School Information System — web dashboard</main>;
}
```

- [ ] **Step 7: Write `docker-compose.yml` for local Postgres**

```yaml
version: "3.8"
services:
  postgres:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: school_is
      POSTGRES_PASSWORD: school_is
      POSTGRES_DB: school_is
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

- [ ] **Step 8: Write env files**

`apps/web/.env.example`:

```
DATABASE_URL="postgresql://school_is:school_is@localhost:5432/school_is"
JWT_SECRET="change-me"
```

`apps/web/.env` (dev):

```
DATABASE_URL="postgresql://school_is:school_is@localhost:5432/school_is"
JWT_SECRET="dev-secret-change-me"
```

`apps/web/.env.test` (test):

```
DATABASE_URL="postgresql://school_is:school_is@localhost:5432/school_is_test"
JWT_SECRET="test-secret"
```

- [ ] **Step 9: Write `.gitignore`**

```
node_modules
.next
.env
```

(Note: `.env.example` and `.env.test` ARE committed; `.env` with real dev secrets is not.)

- [ ] **Step 10: Write Vitest config**

`apps/web/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    hookTimeout: 20000,
    testTimeout: 20000,
  },
});
```

`apps/web/vitest.setup.ts`:

```ts
import { config } from "dotenv";

config({ path: ".env.test" });
```

- [ ] **Step 11: Start Postgres and create the test database**

```bash
docker compose up -d
sleep 3
docker compose exec -T postgres createdb -U school_is school_is_test
```

Expected: no errors; `docker compose ps` shows the `postgres` service as `Up`.

- [ ] **Step 12: Verify the dev server boots**

```bash
npm run dev &
sleep 5
curl -sf http://localhost:3000 | grep -o "School Information System — web dashboard"
kill %1
```

Expected output: `School Information System — web dashboard`

- [ ] **Step 13: Commit**

```bash
cd ..
git add apps/web
git commit -m "Scaffold Next.js app with local Postgres via Docker"
```

---

### Task 2: Prisma schema and migrations

**Files:**
- Create: `apps/web/prisma/schema.prisma`

**Interfaces:**
- Consumes: `DATABASE_URL` from `.env` / `.env.test` (Task 1).
- Produces: Prisma Client types (`School`, `User`, `Student`, `ParentStudent`, `Class`, `ClassTeacher`, `Attendance`, `Assignment`, `AssignmentStatus`, `Exam`, `Mark`, `TimetableEntry`, `FeeStructure`, `FeePayment`, `Notification`, `OtpCode`) and enums (`Role`, `AttendanceStatus`, `AssignmentStatusValue`, `FeeStatus`) used by every later task.

- [ ] **Step 1: Write the full schema**

`apps/web/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  parent
  teacher
  admin
  accountant
}

enum AttendanceStatus {
  present
  absent
  late
}

enum AssignmentStatusValue {
  pending
  submitted
  overdue
}

enum FeeStatus {
  paid
  partial
  unpaid
}

model School {
  id            Int            @id @default(autoincrement())
  name          String
  users         User[]
  students      Student[]
  classes       Class[]
  exams         Exam[]
  feeStructures FeeStructure[]
}

model User {
  id       Int    @id @default(autoincrement())
  phone    String @unique
  role     Role
  name     String
  school   School @relation(fields: [schoolId], references: [id])
  schoolId Int

  parentLinks        ParentStudent[]
  classesTaught      ClassTeacher[]
  attendanceMarked   Attendance[]    @relation("MarkedBy")
  assignmentsCreated Assignment[]
  feePaymentsRecorded FeePayment[]   @relation("RecordedBy")
  notifications      Notification[]
}

model Student {
  id          Int      @id @default(autoincrement())
  school      School   @relation(fields: [schoolId], references: [id])
  schoolId    Int
  name        String
  dob         DateTime
  class       Class    @relation(fields: [classId], references: [id])
  classId     Int
  section     String
  admissionNo String   @unique

  parentLinks        ParentStudent[]
  attendance         Attendance[]
  assignmentStatuses AssignmentStatus[]
  marks              Mark[]
  feePayments        FeePayment[]
}

model ParentStudent {
  id           Int     @id @default(autoincrement())
  parent       User    @relation(fields: [parentUserId], references: [id])
  parentUserId Int
  student      Student @relation(fields: [studentId], references: [id])
  studentId    Int

  @@unique([parentUserId, studentId])
}

model Class {
  id       Int    @id @default(autoincrement())
  school   School @relation(fields: [schoolId], references: [id])
  schoolId Int
  name     String
  section  String

  students         Student[]
  teacherLinks     ClassTeacher[]
  assignments      Assignment[]
  timetableEntries TimetableEntry[]
  feeStructures    FeeStructure[]

  @@unique([schoolId, name, section])
}

model ClassTeacher {
  id            Int    @id @default(autoincrement())
  class         Class  @relation(fields: [classId], references: [id])
  classId       Int
  teacher       User   @relation(fields: [teacherUserId], references: [id])
  teacherUserId Int
  subject       String

  @@unique([classId, teacherUserId, subject])
}

model Attendance {
  id         Int               @id @default(autoincrement())
  student    Student           @relation(fields: [studentId], references: [id])
  studentId  Int
  date       DateTime
  status     AttendanceStatus
  markedBy   User              @relation("MarkedBy", fields: [markedById], references: [id])
  markedById Int
  note       String?

  @@unique([studentId, date])
}

model Assignment {
  id          Int      @id @default(autoincrement())
  class       Class    @relation(fields: [classId], references: [id])
  classId     Int
  subject     String
  title       String
  description String?
  dueDate     DateTime
  createdBy   User     @relation(fields: [createdById], references: [id])
  createdById Int

  statuses AssignmentStatus[]
}

model AssignmentStatus {
  id           Int                   @id @default(autoincrement())
  assignment   Assignment            @relation(fields: [assignmentId], references: [id])
  assignmentId Int
  student      Student               @relation(fields: [studentId], references: [id])
  studentId    Int
  status       AssignmentStatusValue @default(pending)

  @@unique([assignmentId, studentId])
}

model Exam {
  id       Int      @id @default(autoincrement())
  school   School   @relation(fields: [schoolId], references: [id])
  schoolId Int
  name     String
  term     String
  examDate DateTime

  marks Mark[]
}

model Mark {
  id            Int     @id @default(autoincrement())
  exam          Exam    @relation(fields: [examId], references: [id])
  examId        Int
  student       Student @relation(fields: [studentId], references: [id])
  studentId     Int
  subject       String
  marksObtained Float
  maxMarks      Float
  grade         String

  @@unique([examId, studentId, subject])
}

model TimetableEntry {
  id            Int   @id @default(autoincrement())
  class         Class @relation(fields: [classId], references: [id])
  classId       Int
  dayOfWeek     Int
  period        Int
  subject       String
  teacherUserId Int
}

model FeeStructure {
  id       Int      @id @default(autoincrement())
  school   School   @relation(fields: [schoolId], references: [id])
  schoolId Int
  class    Class    @relation(fields: [classId], references: [id])
  classId  Int
  term     String
  amount   Float
  dueDate  DateTime

  payments FeePayment[]
}

model FeePayment {
  id             Int          @id @default(autoincrement())
  student        Student      @relation(fields: [studentId], references: [id])
  studentId      Int
  feeStructure   FeeStructure @relation(fields: [feeStructureId], references: [id])
  feeStructureId Int
  amountPaid     Float
  paidDate       DateTime?
  recordedBy     User         @relation("RecordedBy", fields: [recordedById], references: [id])
  recordedById   Int
  status         FeeStatus    @default(unpaid)
}

model Notification {
  id        Int       @id @default(autoincrement())
  user      User      @relation(fields: [userId], references: [id])
  userId    Int
  type      String
  title     String
  body      String
  relatedId Int?
  readAt    DateTime?
  createdAt DateTime  @default(now())
}

model OtpCode {
  id        Int       @id @default(autoincrement())
  phone     String
  codeHash  String
  salt      String
  expiresAt DateTime
  attempts  Int       @default(0)
  usedAt    DateTime?
  createdAt DateTime  @default(now())
}
```

- [ ] **Step 2: Run the migration against the dev database**

```bash
cd apps/web
npx prisma migrate dev --name init
```

Expected output includes: `Your database is now in sync with your schema.` and generates `prisma/migrations/<timestamp>_init/`.

- [ ] **Step 3: Apply the same migration to the test database**

```bash
npm run prisma:migrate:test
```

Expected output includes: `The following migration(s) have been applied` (or `No pending migrations` on repeat runs).

- [ ] **Step 4: Verify Prisma Client generated successfully**

```bash
npx prisma generate
```

Expected output includes: `Generated Prisma Client`

- [ ] **Step 5: Commit**

```bash
cd ../..
git add apps/web/prisma
git commit -m "Add Prisma schema and initial migration for core domain model"
```

---

### Task 3: Seed fixtures and test DB reset helper

**Files:**
- Create: `apps/web/prisma/fixtures.ts`
- Create: `apps/web/prisma/seed.ts`
- Create: `apps/web/tests/helpers/db.ts`
- Test: `apps/web/tests/seed.test.ts`

**Interfaces:**
- Consumes: Prisma Client types from Task 2.
- Produces: `createSeedFixtures(prisma: PrismaClient)` returning `{ school, classA, teacher, admin, accountant, parent, student }` — used by later tests in this plan and by both future sub-project plans. `resetDb(): Promise<void>` and `prisma` (test client) exported from `tests/helpers/db.ts`, used by every subsequent test file in this plan.

- [ ] **Step 1: Write the test DB helper**

`apps/web/tests/helpers/db.ts`:

```ts
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export async function resetDb(): Promise<void> {
  await prisma.notification.deleteMany();
  await prisma.otpCode.deleteMany();
  await prisma.feePayment.deleteMany();
  await prisma.feeStructure.deleteMany();
  await prisma.mark.deleteMany();
  await prisma.exam.deleteMany();
  await prisma.assignmentStatus.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.timetableEntry.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.classTeacher.deleteMany();
  await prisma.parentStudent.deleteMany();
  await prisma.student.deleteMany();
  await prisma.class.deleteMany();
  await prisma.user.deleteMany();
  await prisma.school.deleteMany();
}
```

- [ ] **Step 2: Write the shared fixture builder**

`apps/web/prisma/fixtures.ts`:

```ts
import type { PrismaClient } from "@prisma/client";

export async function createSeedFixtures(prisma: PrismaClient) {
  const school = await prisma.school.create({ data: { name: "Greenwood High" } });

  const classA = await prisma.class.create({
    data: { schoolId: school.id, name: "Grade 5", section: "A" },
  });

  const teacher = await prisma.user.create({
    data: { phone: "+10000000001", role: "teacher", name: "Anitha Rao", schoolId: school.id },
  });

  const admin = await prisma.user.create({
    data: { phone: "+10000000002", role: "admin", name: "Rajesh Kumar", schoolId: school.id },
  });

  const accountant = await prisma.user.create({
    data: { phone: "+10000000003", role: "accountant", name: "Meena Iyer", schoolId: school.id },
  });

  const parent = await prisma.user.create({
    data: { phone: "+10000000004", role: "parent", name: "Priya Sharma", schoolId: school.id },
  });

  const student = await prisma.student.create({
    data: {
      schoolId: school.id,
      name: "Rohan Sharma",
      dob: new Date("2015-04-12"),
      classId: classA.id,
      section: "A",
      admissionNo: "GH-2026-001",
    },
  });

  await prisma.parentStudent.create({
    data: { parentUserId: parent.id, studentId: student.id },
  });

  await prisma.classTeacher.create({
    data: { classId: classA.id, teacherUserId: teacher.id, subject: "Mathematics" },
  });

  return { school, classA, teacher, admin, accountant, parent, student };
}
```

- [ ] **Step 3: Write the dev seed script**

`apps/web/prisma/seed.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { createSeedFixtures } from "./fixtures";

const prisma = new PrismaClient();

async function main() {
  const { school, student } = await createSeedFixtures(prisma);
  console.log("Seed complete:", { school: school.name, student: student.name });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 4: Write the failing test**

`apps/web/tests/seed.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { createSeedFixtures } from "../prisma/fixtures";

describe("seed fixtures", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("creates a school with linked classes, staff, parent, and student", async () => {
    const fixtures = await createSeedFixtures(prisma);

    const studentWithParents = await prisma.student.findUniqueOrThrow({
      where: { id: fixtures.student.id },
      include: { parentLinks: { include: { parent: true } } },
    });

    expect(studentWithParents.parentLinks).toHaveLength(1);
    expect(studentWithParents.parentLinks[0].parent.phone).toBe("+10000000004");

    const classWithTeacher = await prisma.class.findUniqueOrThrow({
      where: { id: fixtures.classA.id },
      include: { teacherLinks: true },
    });
    expect(classWithTeacher.teacherLinks).toHaveLength(1);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails first (before fixtures.ts existed this would fail; confirm it now passes since Step 2-3 already created the file)**

```bash
cd apps/web
npx vitest run tests/seed.test.ts
```

Expected: PASS (2 assertions inside the single test). If it fails, re-check Task 2 migrations were applied to `school_is_test` (Task 2, Step 3).

- [ ] **Step 6: Run the dev seed script against the dev database**

```bash
npm run seed
```

Expected output: `Seed complete: { school: 'Greenwood High', student: 'Rohan Sharma' }`

- [ ] **Step 7: Commit**

```bash
cd ../..
git add apps/web/prisma/fixtures.ts apps/web/prisma/seed.ts apps/web/tests/helpers/db.ts apps/web/tests/seed.test.ts
git commit -m "Add seed fixtures, dev seed script, and test DB reset helper"
```

---

### Task 4: OTP generation and hashing

**Files:**
- Create: `apps/web/src/lib/auth/otp.ts`
- Test: `apps/web/tests/otp.test.ts`

**Interfaces:**
- Produces: `generateOtpCode(): string`, `hashOtpCode(code: string): { hash: string; salt: string }`, `verifyOtpCode(code: string, hash: string, salt: string): boolean` — used by Task 5 (`sendOtp`) and Task 7 (`verifyOtp`).

- [ ] **Step 1: Write the failing test**

`apps/web/tests/otp.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateOtpCode, hashOtpCode, verifyOtpCode } from "../src/lib/auth/otp";

describe("otp", () => {
  it("generates a 6-digit numeric code", () => {
    const code = generateOtpCode();
    expect(code).toMatch(/^\d{6}$/);
  });

  it("verifies a correctly hashed code", () => {
    const code = "123456";
    const { hash, salt } = hashOtpCode(code);
    expect(verifyOtpCode(code, hash, salt)).toBe(true);
  });

  it("rejects an incorrect code", () => {
    const { hash, salt } = hashOtpCode("123456");
    expect(verifyOtpCode("999999", hash, salt)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/web
npx vitest run tests/otp.test.ts
```

Expected: FAIL with `Cannot find module '../src/lib/auth/otp'`

- [ ] **Step 3: Write the implementation**

`apps/web/src/lib/auth/otp.ts`:

```ts
import { randomInt, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashOtpCode(code: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(code, salt, 64).toString("hex");
  return { hash, salt };
}

export function verifyOtpCode(code: string, hash: string, salt: string): boolean {
  const candidate = scryptSync(code, salt, 64);
  const stored = Buffer.from(hash, "hex");
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/otp.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
cd ../..
git add apps/web/src/lib/auth/otp.ts apps/web/tests/otp.test.ts
git commit -m "Add OTP code generation and hashing utilities"
```

---

### Task 5: SMS sender interface and send-OTP flow

**Files:**
- Create: `apps/web/src/lib/auth/sms-sender.ts`
- Create: `apps/web/src/lib/prisma.ts`
- Create: `apps/web/src/lib/auth/send-otp.ts`
- Create: `apps/web/src/app/api/auth/send-otp/route.ts`
- Test: `apps/web/tests/send-otp.test.ts`

**Interfaces:**
- Consumes: `generateOtpCode`, `hashOtpCode` from `../src/lib/auth/otp` (Task 4).
- Produces: `SmsSender` interface and `ConsoleSmsSender` class (used by the API route now; will be swapped for a Twilio implementation in the future Notifications sub-project). `sendOtp(phone: string, deps: { prisma: PrismaClient; smsSender: SmsSender }): Promise<{ success: true }>` — used by Task 7's tests and by later sub-projects' login flow. Throws `Error("PHONE_NOT_REGISTERED")` for unknown phones.

- [ ] **Step 1: Write the Prisma client singleton (needed by the API route)**

`apps/web/src/lib/prisma.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 2: Write the SMS sender interface**

`apps/web/src/lib/auth/sms-sender.ts`:

```ts
export interface SmsSender {
  send(phone: string, message: string): Promise<void>;
}

export class ConsoleSmsSender implements SmsSender {
  async send(phone: string, message: string): Promise<void> {
    console.log(`[SMS to ${phone}]: ${message}`);
  }
}
```

- [ ] **Step 3: Write the failing test for `sendOtp`**

`apps/web/tests/send-otp.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { sendOtp } from "../src/lib/auth/send-otp";
import type { SmsSender } from "../src/lib/auth/sms-sender";

class FakeSmsSender implements SmsSender {
  public sentMessages: { phone: string; message: string }[] = [];
  async send(phone: string, message: string): Promise<void> {
    this.sentMessages.push({ phone, message });
  }
}

describe("sendOtp", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("stores a hashed OTP and sends it via SMS for a registered phone", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await prisma.user.create({
      data: { phone: "+15550001111", role: "parent", name: "Test Parent", schoolId: school.id },
    });

    const smsSender = new FakeSmsSender();
    const result = await sendOtp("+15550001111", { prisma, smsSender });

    expect(result.success).toBe(true);
    expect(smsSender.sentMessages).toHaveLength(1);
    expect(smsSender.sentMessages[0].phone).toBe("+15550001111");

    const stored = await prisma.otpCode.findFirst({ where: { phone: "+15550001111" } });
    expect(stored).not.toBeNull();
    expect(stored?.codeHash).not.toBe("");
  });

  it("rejects an unregistered phone number", async () => {
    const smsSender = new FakeSmsSender();
    await expect(sendOtp("+15559999999", { prisma, smsSender })).rejects.toThrow(
      "PHONE_NOT_REGISTERED"
    );
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
cd apps/web
npx vitest run tests/send-otp.test.ts
```

Expected: FAIL with `Cannot find module '../src/lib/auth/send-otp'`

- [ ] **Step 5: Write the implementation**

`apps/web/src/lib/auth/send-otp.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { generateOtpCode, hashOtpCode } from "./otp";
import type { SmsSender } from "./sms-sender";

const OTP_TTL_MINUTES = 5;

export async function sendOtp(
  phone: string,
  deps: { prisma: PrismaClient; smsSender: SmsSender }
): Promise<{ success: true }> {
  const user = await deps.prisma.user.findUnique({ where: { phone } });
  if (!user) {
    throw new Error("PHONE_NOT_REGISTERED");
  }

  const code = generateOtpCode();
  const { hash, salt } = hashOtpCode(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await deps.prisma.otpCode.create({
    data: { phone, codeHash: hash, salt, expiresAt },
  });

  await deps.smsSender.send(phone, `Your School IS verification code is ${code}`);

  return { success: true };
}
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
npx vitest run tests/send-otp.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 7: Wire the API route**

`apps/web/src/app/api/auth/send-otp/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendOtp } from "@/lib/auth/send-otp";
import { ConsoleSmsSender } from "@/lib/auth/sms-sender";

export async function POST(request: Request) {
  const { phone } = await request.json();
  if (!phone) {
    return NextResponse.json({ error: "phone is required" }, { status: 400 });
  }
  try {
    await sendOtp(phone, { prisma, smsSender: new ConsoleSmsSender() });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof Error && err.message === "PHONE_NOT_REGISTERED") {
      return NextResponse.json({ error: "Phone number is not registered" }, { status: 404 });
    }
    throw err;
  }
}
```

- [ ] **Step 8: Commit**

```bash
cd ../..
git add apps/web/src/lib/auth/sms-sender.ts apps/web/src/lib/prisma.ts apps/web/src/lib/auth/send-otp.ts apps/web/src/app/api/auth/send-otp apps/web/tests/send-otp.test.ts
git commit -m "Add send-OTP flow with pluggable SMS sender"
```

---

### Task 6: Session JWT utility

**Files:**
- Create: `apps/web/src/lib/auth/jwt.ts`
- Test: `apps/web/tests/jwt.test.ts`

**Interfaces:**
- Produces: `SessionClaims { userId: number; role: "parent" | "teacher" | "admin" | "accountant"; schoolId: number }`, `signSessionToken(claims: SessionClaims): string`, `verifySessionToken(token: string): SessionClaims` — used by Task 7 (`verifyOtp`) and Task 8 (`requireRole`).

- [ ] **Step 1: Write the failing test**

`apps/web/tests/jwt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { signSessionToken, verifySessionToken } from "../src/lib/auth/jwt";

describe("session jwt", () => {
  it("round-trips claims through sign and verify", () => {
    const token = signSessionToken({ userId: 42, role: "parent", schoolId: 1 });
    const claims = verifySessionToken(token);

    expect(claims.userId).toBe(42);
    expect(claims.role).toBe("parent");
    expect(claims.schoolId).toBe(1);
  });

  it("throws for a tampered token", () => {
    const token = signSessionToken({ userId: 42, role: "parent", schoolId: 1 });
    const tampered = token.slice(0, -2) + "xx";
    expect(() => verifySessionToken(tampered)).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/web
npx vitest run tests/jwt.test.ts
```

Expected: FAIL with `Cannot find module '../src/lib/auth/jwt'`

- [ ] **Step 3: Write the implementation**

`apps/web/src/lib/auth/jwt.ts`:

```ts
import jwt from "jsonwebtoken";

export interface SessionClaims {
  userId: number;
  role: "parent" | "teacher" | "admin" | "accountant";
  schoolId: number;
}

const SESSION_TTL = "30d";

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}

export function signSessionToken(claims: SessionClaims): string {
  return jwt.sign(claims, getSecret(), { expiresIn: SESSION_TTL });
}

export function verifySessionToken(token: string): SessionClaims {
  return jwt.verify(token, getSecret()) as SessionClaims;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/jwt.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
cd ../..
git add apps/web/src/lib/auth/jwt.ts apps/web/tests/jwt.test.ts
git commit -m "Add session JWT sign/verify utility"
```

---

### Task 7: Verify-OTP flow

**Files:**
- Create: `apps/web/src/lib/auth/verify-otp.ts`
- Create: `apps/web/src/app/api/auth/verify-otp/route.ts`
- Test: `apps/web/tests/verify-otp.test.ts`

**Interfaces:**
- Consumes: `verifyOtpCode` from `./otp` (Task 4), `signSessionToken` from `./jwt` (Task 6), `sendOtp` from `./send-otp` (Task 5, used only in tests to generate a real code).
- Produces: `VerifyOtpResult = { ok: true; token: string } | { ok: false; error: "INVALID_CODE" | "EXPIRED" | "NOT_FOUND" }`, `verifyOtp(phone: string, code: string, deps: { prisma: PrismaClient }): Promise<VerifyOtpResult>` — used by future login screens in the mobile app sub-project.

- [ ] **Step 1: Write the failing test**

`apps/web/tests/verify-otp.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { sendOtp } from "../src/lib/auth/send-otp";
import { verifyOtp } from "../src/lib/auth/verify-otp";
import { verifySessionToken } from "../src/lib/auth/jwt";
import type { SmsSender } from "../src/lib/auth/sms-sender";

class FakeSmsSender implements SmsSender {
  public lastMessage = "";
  async send(_phone: string, message: string): Promise<void> {
    this.lastMessage = message;
  }
}

function extractCode(message: string): string {
  const match = message.match(/\d{6}/);
  if (!match) throw new Error("no code found in message");
  return match[0];
}

describe("verifyOtp", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("issues a session token for a correct, unexpired code", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    const user = await prisma.user.create({
      data: { phone: "+15550002222", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });

    const smsSender = new FakeSmsSender();
    await sendOtp("+15550002222", { prisma, smsSender });
    const code = extractCode(smsSender.lastMessage);

    const result = await verifyOtp("+15550002222", code, { prisma });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const claims = verifySessionToken(result.token);
      expect(claims.userId).toBe(user.id);
      expect(claims.role).toBe("teacher");
      expect(claims.schoolId).toBe(school.id);
    }
  });

  it("rejects an incorrect code", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await prisma.user.create({
      data: { phone: "+15550003333", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });

    const smsSender = new FakeSmsSender();
    await sendOtp("+15550003333", { prisma, smsSender });

    const result = await verifyOtp("+15550003333", "000000", { prisma });
    expect(result).toEqual({ ok: false, error: "INVALID_CODE" });
  });

  it("rejects an expired code", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await prisma.user.create({
      data: { phone: "+15550004444", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });

    const smsSender = new FakeSmsSender();
    await sendOtp("+15550004444", { prisma, smsSender });
    const code = extractCode(smsSender.lastMessage);

    await prisma.otpCode.updateMany({
      where: { phone: "+15550004444" },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const result = await verifyOtp("+15550004444", code, { prisma });
    expect(result).toEqual({ ok: false, error: "EXPIRED" });
  });

  it("rejects reuse of an already-verified code", async () => {
    const school = await prisma.school.create({ data: { name: "Test School" } });
    await prisma.user.create({
      data: { phone: "+15550005555", role: "teacher", name: "Test Teacher", schoolId: school.id },
    });

    const smsSender = new FakeSmsSender();
    await sendOtp("+15550005555", { prisma, smsSender });
    const code = extractCode(smsSender.lastMessage);

    await verifyOtp("+15550005555", code, { prisma });
    const secondAttempt = await verifyOtp("+15550005555", code, { prisma });

    expect(secondAttempt).toEqual({ ok: false, error: "NOT_FOUND" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/web
npx vitest run tests/verify-otp.test.ts
```

Expected: FAIL with `Cannot find module '../src/lib/auth/verify-otp'`

- [ ] **Step 3: Write the implementation**

`apps/web/src/lib/auth/verify-otp.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { verifyOtpCode } from "./otp";
import { signSessionToken } from "./jwt";

export type VerifyOtpResult =
  | { ok: true; token: string }
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

  await deps.prisma.otpCode.update({
    where: { id: otpRecord.id },
    data: { usedAt: new Date() },
  });

  const user = await deps.prisma.user.findUniqueOrThrow({ where: { phone } });

  const token = signSessionToken({
    userId: user.id,
    role: user.role,
    schoolId: user.schoolId,
  });

  return { ok: true, token };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/verify-otp.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Wire the API route**

`apps/web/src/app/api/auth/verify-otp/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyOtp } from "@/lib/auth/verify-otp";

export async function POST(request: Request) {
  const { phone, code } = await request.json();
  if (!phone || !code) {
    return NextResponse.json({ error: "phone and code are required" }, { status: 400 });
  }
  const result = await verifyOtp(phone, code, { prisma });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }
  return NextResponse.json({ token: result.token });
}
```

- [ ] **Step 6: Commit**

```bash
cd ../..
git add apps/web/src/lib/auth/verify-otp.ts apps/web/src/app/api/auth/verify-otp apps/web/tests/verify-otp.test.ts
git commit -m "Add verify-OTP flow issuing session JWTs"
```

---

### Task 8: RBAC middleware

**Files:**
- Create: `apps/web/src/lib/auth/rbac.ts`
- Test: `apps/web/tests/rbac.test.ts`

**Interfaces:**
- Consumes: `SessionClaims`, `verifySessionToken` from `./jwt` (Task 6).
- Produces: `AuthError extends Error { status: 401 | 403 }`, `requireRole(authHeader: string | null, allowedRoles: SessionClaims["role"][]): SessionClaims` — every protected API route built in later sub-projects calls this first with the incoming `Authorization` header.

- [ ] **Step 1: Write the failing test**

`apps/web/tests/rbac.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { requireRole, AuthError } from "../src/lib/auth/rbac";
import { signSessionToken } from "../src/lib/auth/jwt";

describe("requireRole", () => {
  it("returns claims for a valid token with an allowed role", () => {
    const token = signSessionToken({ userId: 1, role: "teacher", schoolId: 1 });
    const claims = requireRole(`Bearer ${token}`, ["teacher", "admin"]);
    expect(claims.userId).toBe(1);
    expect(claims.role).toBe("teacher");
  });

  it("throws a 403 AuthError for a valid token with a disallowed role", () => {
    const token = signSessionToken({ userId: 1, role: "parent", schoolId: 1 });
    try {
      requireRole(`Bearer ${token}`, ["teacher", "admin"]);
      throw new Error("expected requireRole to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError);
      expect((err as AuthError).status).toBe(403);
    }
  });

  it("throws a 401 AuthError for a missing Authorization header", () => {
    try {
      requireRole(null, ["teacher"]);
      throw new Error("expected requireRole to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError);
      expect((err as AuthError).status).toBe(401);
    }
  });

  it("throws a 401 AuthError for an invalid token", () => {
    try {
      requireRole("Bearer not-a-real-token", ["teacher"]);
      throw new Error("expected requireRole to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError);
      expect((err as AuthError).status).toBe(401);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/web
npx vitest run tests/rbac.test.ts
```

Expected: FAIL with `Cannot find module '../src/lib/auth/rbac'`

- [ ] **Step 3: Write the implementation**

`apps/web/src/lib/auth/rbac.ts`:

```ts
import { verifySessionToken, type SessionClaims } from "./jwt";

export class AuthError extends Error {
  status: 401 | 403;
  constructor(status: 401 | 403, message: string) {
    super(message);
    this.status = status;
  }
}

export function requireRole(
  authHeader: string | null,
  allowedRoles: SessionClaims["role"][]
): SessionClaims {
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError(401, "Missing or malformed Authorization header");
  }

  const token = authHeader.slice("Bearer ".length);

  let claims: SessionClaims;
  try {
    claims = verifySessionToken(token);
  } catch {
    throw new AuthError(401, "Invalid or expired token");
  }

  if (!allowedRoles.includes(claims.role)) {
    throw new AuthError(403, "Role not permitted for this resource");
  }

  return claims;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/rbac.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
cd ../..
git add apps/web/src/lib/auth/rbac.ts apps/web/tests/rbac.test.ts
git commit -m "Add requireRole RBAC guard for API routes"
```

---

### Task 9: Scoped query helpers

**Files:**
- Create: `apps/web/src/lib/data/scoped-queries.ts`
- Test: `apps/web/tests/scoped-queries.test.ts`

**Interfaces:**
- Consumes: `createSeedFixtures` from `../prisma/fixtures` (Task 3, tests only), Prisma Client types from Task 2.
- Produces: `getStudentsForParent(prisma: PrismaClient, parentUserId: number): Promise<Student[]>`, `getClassesForTeacher(prisma: PrismaClient, teacherUserId: number): Promise<Class[]>` — the scoping helpers every parent-facing and teacher-facing API route in later sub-projects will call to enforce RBAC at the data level.

- [ ] **Step 1: Write the failing test**

`apps/web/tests/scoped-queries.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb } from "./helpers/db";
import { createSeedFixtures } from "../prisma/fixtures";
import { getStudentsForParent, getClassesForTeacher } from "../src/lib/data/scoped-queries";

describe("scoped queries", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("returns only the students linked to a given parent", async () => {
    const fixtures = await createSeedFixtures(prisma);

    const students = await getStudentsForParent(prisma, fixtures.parent.id);

    expect(students).toHaveLength(1);
    expect(students[0].id).toBe(fixtures.student.id);
  });

  it("returns an empty array for a parent with no linked students", async () => {
    const school = await prisma.school.create({ data: { name: "Other School" } });
    const otherParent = await prisma.user.create({
      data: { phone: "+15559990000", role: "parent", name: "No Kids", schoolId: school.id },
    });

    const students = await getStudentsForParent(prisma, otherParent.id);
    expect(students).toEqual([]);
  });

  it("returns only the classes a given teacher is assigned to", async () => {
    const fixtures = await createSeedFixtures(prisma);

    const classes = await getClassesForTeacher(prisma, fixtures.teacher.id);

    expect(classes).toHaveLength(1);
    expect(classes[0].id).toBe(fixtures.classA.id);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/web
npx vitest run tests/scoped-queries.test.ts
```

Expected: FAIL with `Cannot find module '../src/lib/data/scoped-queries'`

- [ ] **Step 3: Write the implementation**

`apps/web/src/lib/data/scoped-queries.ts`:

```ts
import type { PrismaClient, Student, Class } from "@prisma/client";

export async function getStudentsForParent(
  prisma: PrismaClient,
  parentUserId: number
): Promise<Student[]> {
  const links = await prisma.parentStudent.findMany({
    where: { parentUserId },
    include: { student: true },
  });
  return links.map((link) => link.student);
}

export async function getClassesForTeacher(
  prisma: PrismaClient,
  teacherUserId: number
): Promise<Class[]> {
  const links = await prisma.classTeacher.findMany({
    where: { teacherUserId },
    include: { class: true },
    distinct: ["classId"],
  });
  return links.map((link) => link.class);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/scoped-queries.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Run the full test suite to confirm nothing regressed**

```bash
npx vitest run
```

Expected: All test files pass (seed, otp, jwt, send-otp, verify-otp, rbac, scoped-queries).

- [ ] **Step 6: Commit**

```bash
cd ../..
git add apps/web/src/lib/data/scoped-queries.ts apps/web/tests/scoped-queries.test.ts
git commit -m "Add RBAC-scoped query helpers for parents and teachers"
```

---

## Definition of Done

- `docker compose up -d` brings up local Postgres; `npm run dev` serves the Next.js shell.
- `npx prisma migrate dev` / `migrate deploy` apply the full schema to both dev and test databases.
- `npm run seed` populates one school with a class, teacher, admin, accountant, parent, and student, linked correctly.
- `POST /api/auth/send-otp` issues and stores a hashed OTP for a registered phone (logged to console via `ConsoleSmsSender`); rejects unregistered phones with 404.
- `POST /api/auth/verify-otp` exchanges a correct, unexpired, unused code for a session JWT carrying `userId`, `role`, `schoolId`; rejects wrong/expired/reused codes with 401.
- `requireRole` gates access by role and throws typed `AuthError`s (401/403) that later route handlers can catch and translate to HTTP responses.
- `getStudentsForParent` / `getClassesForTeacher` give later sub-projects (web dashboard, mobile app) ready-made, tested RBAC scoping at the data layer.
- `npx vitest run` passes end-to-end with zero manual setup beyond `docker compose up -d` and the two migration commands.
