# School Information System — Design Spec

Status: Approved (MVP scope) — 2026-07-02

## 1. Business Analysis

**Core problem:** Parents rely on scattered, low-visibility channels (WhatsApp groups, paper diaries, occasional PTMs) to track their child's academic progress and school activities. Schools lack a single, low-effort way to keep parents informed, so issues (missed deadlines, late fee payments, attendance problems) surface too late to act on.

**Value:**
- **Parents:** One app for attendance, marks, assignments, fees, and alerts — no more chasing teachers or WhatsApp groups.
- **Teachers:** Post attendance/marks/assignments once; parents see it instantly, reducing repetitive "what's the homework?" queries.
- **Admin/Accountant:** Centralized fee tracking, reduced front-desk load, single source of truth for student records.

**Business model:** B2B SaaS sold to schools (per-student or per-school annual license). Parents get free access as part of the school's subscription — this is the standard model in this category and keeps trust intact by not monetizing parents directly.

**Competitors:** Entab, Fedena, MyClassCampus, Teachmint, Classe365. These are largely admin-ERP-first products with a bolted-on parent app. **Differentiation:** a genuinely mobile-first, parent-obsessed experience — glanceable, low-friction, built for a parent checking their phone for 30 seconds, not a portal to be navigated.

## 2. Feature Scope

### MVP (Phase 1)

| Module | MVP included |
|---|---|
| Student profile | Basic profile, class/section, parent linkage (many-to-many) |
| Attendance | Daily marking by teacher, monthly %, absence alerts |
| Assignments | List, due dates, teacher-posted, submission status tracking |
| Timetable | Static weekly timetable per class/section |
| Marks | Exam-wise marks entry, subject breakdown, grade |
| Fees | Fee structure, manual payment recording (Accountant), due reminders |
| Notifications | In-app + SMS/WhatsApp for absence, fee due, new assignment/marks |
| Roles | Parent, Teacher, Admin, Accountant (RBAC) |

### Phase 2 — Enhancements
- Online fee payment gateway integration
- Leave-request workflow for attendance
- Marks performance trend charts (visual)
- Substitution / live timetable changes
- Per-alert notification preferences (opt-in/out)

### Phase 3 — Scaling & AI
- Multi-tenant onboarding (self-serve school signup, per-school billing)
- AI-powered features: performance prediction (flag downward trends before report cards), attendance-risk alerts, personalized parent insight summaries
- Automated report generation (monthly PDF summary per student)
- Admin analytics dashboard across classes/school

### Automation opportunities (all phases)
- Absence → automatic SMS/WhatsApp alert to parent same day
- Fee due date approaching → automated reminder sequence
- New assignment/marks posted → automatic push + in-app notification
- (Phase 3) Attendance/marks trend crossing a threshold → automatic risk flag to parent + admin

## 3. Personas

**Parent — "Priya", 38, working professional**
- Goals: Instant visibility into absences, fee dues, pending homework — without messaging the teacher.
- Pain points: WhatsApp group noise, no single source of truth, learns about problems too late.
- Behavior: Frequent, brief phone checks; wants glanceable info. Often has multiple children in the same school and needs to switch between them easily.

**Teacher — "Anitha", 29, class + subject teacher**
- Goals: Mark attendance and post marks/assignments quickly between classes; reduce repetitive parent questions.
- Pain points: Manual attendance registers, no easy way to broadcast to a whole class at once.
- Behavior: Uses the web dashboard in short bursts during free periods; needs bulk actions (mark class present, then flag exceptions).

**Admin — "Rajesh", 45, school administrator**
- Goals: Keep records accurate, reduce front-desk parent queries, oversee the school's data as a whole.
- Pain points: Student data scattered across registers/Excel, constant routine parent queries.
- Behavior: Daily web dashboard use for admin tasks and reporting.

**Accountant — new role, fee-scoped**
- Goals: Track fee collection, follow up on dues, keep payment records accurate.
- Pain points: Manual, time-consuming fee follow-ups; no visibility into who's behind on payment.
- Behavior: Uses only the Fees section of the web dashboard; no access to marks/attendance/student academic records.

## 4. Key User Flows

1. **Login/onboarding (parent):** Admin pre-registers parent phone number linked to student(s) → parent installs app → enters phone → OTP → lands on dashboard; if multiple children, all appear under one account via a child-switcher.
2. **Parent dashboard usage:** Open app → card-based summary (attendance %, pending assignments, latest marks, fee due) for the selected child → tap any card to drill into that module.
3. **Attendance viewing:** Dashboard attendance card → monthly calendar view (present/absent/late) → tap a date for detail/note.
4. **Marks/assignments tracking:** Assignments tab → list sorted by due date with status badges (pending/submitted/overdue). Marks tab → list of exams → tap → subject-wise breakdown with grade.
5. **Fee tracking:** Fees tab → current dues + payment history → due items show a reminder banner; tap for fee structure breakdown (no in-app payment in MVP — "pay at school/bank" info only).

## 5. System Architecture

**Roles (RBAC):** Parent, Teacher, Admin, Accountant. Enforced via a `role` field on each user plus row-level scoping — e.g., a Teacher only sees their assigned classes (via `class_teacher`), a Parent only sees linked children (via `parent_student`), an Accountant only touches fee tables.

**Clients**
- **Parent mobile app:** React Native (Expo) — single codebase for iOS + Android, Expo push notifications, EAS Build for store releases.
- **Web dashboard:** Next.js + TypeScript + Tailwind CSS, used by Teacher/Admin/Accountant — desktop-oriented for bulk data entry (e.g. marking a full class's attendance in one screen).

**Backend**
- Single Node/Next.js API layer (route handlers), shared by both clients — avoids maintaining a separate backend service for a small team.
- REST-style endpoints grouped by resource: `/api/students`, `/api/attendance`, `/api/assignments`, `/api/exams`, `/api/marks`, `/api/fees`, `/api/notifications`, `/api/timetable`. Every endpoint enforces the caller's role/scope server-side.
- Business logic (attendance % computation, absence-alert triggers, fee-due reminders) lives in backend service functions — testable and reusable across both clients.

**Database:** PostgreSQL, hosted on Supabase (or Neon). Relational fit for this domain (joins across students/classes/exams/fees). Every table carries `school_id` (directly or via FK) from day one, even for a single-school MVP, so Phase 3 multi-tenancy is a query filter, not a migration.

**Auth:** Phone number + OTP for all roles (Supabase Auth or Twilio Verify), with a `role` claim issued on login controlling what each client/API call can access.

**Notifications:** Event-driven. Key actions (attendance marked absent, assignment posted, fee due recorded) write a `notifications` row and trigger delivery via Expo push (in-app) + Twilio SMS/WhatsApp Business API for the alert-worthy subset (absence, fee due, exam results).

**Hosting/deployment:** Web dashboard + API on Vercel; Postgres on Supabase; mobile builds via Expo EAS, distributed through TestFlight/Play Internal Testing during MVP, then public store listing at launch.

## 6. Database Design (core tables)

```
schools            (id PK, name, ...)                         -- present now for future multi-tenancy
users              (id PK, phone, role, school_id FK, name)    -- role: parent/teacher/admin/accountant
students           (id PK, school_id FK, name, dob, class_id FK, section, admission_no)
parent_student     (id PK, parent_user_id FK -> users, student_id FK -> students)  -- many-to-many
classes            (id PK, school_id FK, name, section)
class_teacher      (id PK, class_id FK, teacher_user_id FK -> users, subject)

attendance         (id PK, student_id FK, date, status[present/absent/late], marked_by FK -> users, note)

assignments        (id PK, class_id FK, subject, title, description, due_date, created_by FK -> users)
assignment_status  (id PK, assignment_id FK, student_id FK, status[pending/submitted/overdue])

exams              (id PK, school_id FK, name, term, exam_date)
marks              (id PK, exam_id FK, student_id FK, subject, marks_obtained, max_marks, grade)

timetable_entry    (id PK, class_id FK, day_of_week, period, subject, teacher_user_id FK)

fee_structure      (id PK, school_id FK, class_id FK, term, amount, due_date)
fee_payment        (id PK, student_id FK, fee_structure_id FK, amount_paid, paid_date, recorded_by FK -> users, status[paid/partial/unpaid])

notifications      (id PK, user_id FK, type, title, body, related_id, read_at, created_at)
```

Key relationships: `parent_student` and `class_teacher` are the join tables that drive RBAC scoping — a parent's API access is filtered by their `parent_student` rows; a teacher's by `class_teacher` rows. Accountant role is scoped at the API layer to `fee_structure`/`fee_payment` only.

## 7. UI/UX Design

**Parent mobile app — navigation:** Bottom tab bar: Home, Attendance, Assignments, Marks, Fees. Notification bell in the header; child-switcher (avatar chips) at the top of Home for multi-child parents.

**Home dashboard (mobile-first, card-based, single column):**
- Header: school logo, child-switcher, notification bell
- Card: Attendance — this month's % with progress indicator
- Card: Upcoming assignments — next 2-3 due items with due-date badges
- Card: Recent marks — latest exam result summary
- Card: Fees — outstanding amount + due date if any
- Every card taps through to its full module screen

**Design principles:** Large tap targets, minimal text per screen, consistent color coding (green = good/paid, amber = due soon, red = overdue/absent) across all modules so status reads at a glance.

**Web dashboard (Teacher/Admin/Accountant) — navigation:** Left sidebar (Dashboard, Students, Attendance, Assignments, Exams & Marks, Timetable, Fees), scoped per role — Accountant sees only Dashboard + Fees. Optimized for bulk data entry: attendance is a single table of all students in a class with one-tap toggles per row and a "mark all present" bulk action.

## 8. Development Roadmap

**Phase 1 — MVP (~10-12 weeks, 1-2 full-stack devs)**
- Weeks 1-2: Data model, OTP auth, RBAC scaffolding, school/class/student/parent setup
- Weeks 3-5: Web dashboard — attendance marking, marks entry, assignment posting, fee recording
- Weeks 6-9: Parent mobile app — dashboard, attendance/assignments/marks/fees tabs, push notifications
- Weeks 10-12: SMS/WhatsApp alert integration, testing, TestFlight/Play internal release, pilot with one school

**Phase 2 — Enhancements (~6-8 weeks)** — see Feature Scope above.

**Phase 3 — Scaling & AI (~8-10 weeks+, ongoing)** — see Feature Scope above.

## 9. MVP User Stories (representative sample)

- **As a Parent**, I can log in with my phone number and OTP, so I don't need to remember a password.
  - *Acceptance:* Entering a registered phone number sends an OTP via SMS; correct OTP logs me in; unregistered numbers show a clear "not linked to a student" message.
- **As a Parent**, I can see my child's attendance % for the current month on the home dashboard, so I know at a glance if there's an issue.
  - *Acceptance:* Card shows current-month % computed from `attendance` rows; tapping opens the monthly calendar view.
- **As a Teacher**, I can mark attendance for my whole class in one screen, so I don't spend more than a minute per class.
  - *Acceptance:* Table lists all students in the class defaulting to "present"; I can toggle individual students to absent/late; saving writes one `attendance` row per student for that date.
- **As a Parent**, I receive an SMS/WhatsApp alert the same day my child is marked absent, so I know immediately.
  - *Acceptance:* Marking a student absent triggers a notification job that sends SMS/WhatsApp to all linked parents within minutes.
- **As an Accountant**, I can record a fee payment against a student's fee structure, so their paid/unpaid status updates immediately.
  - *Acceptance:* Recording a payment updates `fee_payment` and recomputes status (paid/partial/unpaid); the parent app reflects the new status on next load.
- **As a Parent**, I can view my child's exam marks broken down by subject with the grade, so I understand performance without asking the teacher.
  - *Acceptance:* Marks tab lists exams; tapping an exam shows all subjects with marks obtained/max marks/grade.

Further user stories and the full epic/task breakdown will be produced in the implementation plan (next step).

## 10. Risks & Assumptions

**Assumptions**
- The pilot school has (or will collect) accurate parent phone numbers for OTP-based login.
- Teachers are willing/able to do attendance and marks entry digitally rather than on paper.
- SMS/WhatsApp Business API costs per message are acceptable at the pilot school's scale.
- Single-school MVP; no billing/subscription flow needed until Phase 3 multi-tenancy.

**Risks**
- **Data entry adoption:** If teachers don't reliably use the web dashboard, the parent app has nothing to show — mitigate with a very low-friction bulk attendance UI and admin visibility into entry compliance.
- **OTP delivery reliability:** SMS delivery can be inconsistent in some regions/carriers — mitigate by adding WhatsApp OTP as a fallback channel if SMS delivery issues surface in the pilot.
- **Multi-child/multi-parent data model complexity:** The `parent_student` many-to-many needs careful UI handling (child-switcher) to avoid confusing parents with more than one child at the school.
- **Fee status disputes:** Manual payment recording (no gateway in MVP) means human error risk in marking payments — mitigate with a payment history audit trail (`recorded_by`, `paid_date` already in schema) and a simple correction/edit flow.
