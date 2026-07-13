# Teacher Attendance Permission Rules — Design

Date: 2026-07-13
Phase: 3 of 3 (Parent Dashboard → Assignment Module → Teacher Attendance)

## Context

The attendance module (`apps/web/src/app/api/attendance/`, `apps/web/src/lib/attendance.ts`,
`apps/web/src/components/attendance/AttendanceView.tsx`) already supports marking
present/absent/late per student (click-to-cycle, "Mark All Present/Absent", a review
panel, and a "Submit All" button that POSTs the batch). This phase adds the edit-window
permission rules from the request. Two gaps exist relative to the spec today:

- `POST /api/attendance` is teacher-only (`requireApiRole(["teacher"])`) — **admins
  cannot edit attendance at all**, contradicting "Admin can edit attendance at any time."
- `markAttendance` performs an upsert for whatever `date` is passed with no restriction —
  **teachers can currently edit any date**, contradicting "Teachers can edit today's
  attendance before submission... cannot edit previous dates."

There is no existing "submitted" lock concept in the schema (every save is an immediate
upsert), and the request's wording ("before submission") is satisfied by the existing
review-panel-then-Submit-All flow — no new schema or submission-state tracking is needed.
The only new rule is a **date-based** edit restriction for teachers.

## Goals

1. Teachers can mark/edit attendance only for today's date (server UTC day). Past and
   future dates are locked for teachers.
2. Teachers can still view (read-only) any date's roster, including past and future.
3. Admins can edit attendance for any date, including past and future — this is new
   capability, since admins currently cannot edit at all.

## Non-goals

- Any change to Parent Dashboard (Phase 1) or Assignment Module (Phase 2).
- A persisted "submitted" lock (e.g. preventing a teacher from re-editing today's
  attendance after clicking Submit All) — not requested; today's attendance stays
  editable all day for the teacher, consistent with "can edit today's attendance before
  submission" (submission = clicking Submit All, which can happen more than once as
  corrections are made during the day).
- Attendance UI for future-dated planning workflows beyond the existing date picker.

## Design

### 1. Server-side rule (source of truth)

- `apps/web/src/app/api/attendance/route.ts`: change the `POST` handler's
  `requireApiRole(["teacher"])` to `requireApiRole(["teacher", "admin"])`.
- `apps/web/src/lib/attendance.ts`'s `markAttendance` gains a `role: SessionClaims["role"]`
  parameter. When `role === "teacher"`, compare `params.date` against today's UTC date
  string (`new Date().toISOString().slice(0, 10)`, the same convention already used by
  `todayDateString()` in `AttendanceView.tsx`). If they don't match, return
  `{ ok: false, error: "DATE_LOCKED" }` before touching the database. When
  `role === "admin"`, skip this check entirely.
- `MarkAttendanceResult` gains the `"DATE_LOCKED"` variant; the `POST` route maps it to
  a 403 with the message "Teachers can only edit today's attendance."

### 2. Client-side rule (UX, not the security boundary)

- In `apps/web/src/components/attendance/AttendanceView.tsx`, introduce:
  ```
  const isEditable = role === "admin" || (role === "teacher" && date === todayDateString());
  ```
- Replace every current `role === "teacher"` conditional that gates editing (the
  Mark All Present/Absent/Reset button row, `StudentAttendanceCard`'s `onClick`, the
  Submit All button, and the review panel) with `isEditable`.
- When not editable, the roster renders exactly like the current read-only admin view:
  cards show status, clicks are a no-op, no Mark All/Submit/Review controls render.
- Admins, who previously had no editing controls at all, now get the full editing UI
  for any selected date.

### 3. Error handling

- If a teacher's client is out of sync (e.g. the date changed underneath them) and a
  POST is sent for a non-today date, the API's 403 flows through the existing `error`
  state in `AttendanceView` exactly like other rejections (`"NOT_ASSIGNED"`, etc.) — no
  new UI component needed, just the new message text.

## Data flow

```
Teacher/Admin opens Attendance page
  → AttendanceView fetches roster via GET /api/attendance (unchanged, both roles can view any date)
  → isEditable = admin || (teacher && date === today)
  → if isEditable: Mark All / click-to-cycle / Submit All render, POST allowed
  → if not editable: read-only cards, no editing controls

POST /api/attendance
  → requireApiRole(["teacher", "admin"])
  → markAttendance(prisma, { ..., role })
       → role === "teacher" && date !== today  → { ok: false, error: "DATE_LOCKED" } → 403
       → otherwise                             → upsert/delete as today, → 200
```

## Testing

- `markAttendance`: teacher marking today succeeds; teacher marking yesterday or
  tomorrow returns `DATE_LOCKED`; admin marking any date (past, today, future) succeeds.
- API tests (`apps/web/tests/attendance-api.test.ts`): update the existing "rejects an
  admin attempting to POST with 403" test — this behavior is intentionally reversed, so
  it becomes "allows admin to POST for any date"; add a new test asserting a teacher
  gets 403 with `DATE_LOCKED`'s message for a non-today date.
- Component test (`apps/web/tests/attendance-view.test.tsx`): `AttendanceView` renders
  read-only (no Mark All/Submit, clicks don't change status) when `role="teacher"` and
  the selected `date` isn't today; renders fully editable when `role="admin"` regardless
  of date, and when `role="teacher"` and `date` is today.
- Manual browser check: as a teacher, mark today's attendance (works), switch the date
  picker to yesterday (roster shows read-only, no Mark All/Submit visible); as an admin,
  edit both today's and a past date's attendance successfully.

## Open items carried to later phases

None — this is the last of the three planned phases. Any further work (e.g. a
persisted submission lock, admin audit trail of edits) would need a new request.
