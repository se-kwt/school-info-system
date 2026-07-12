# Student Form Visual Redesign

## Goal
Redesign the visual styling of `StudentDetailModal.tsx` (the 3-section Student/Sibling/Parent form): add a real, visible `<label>` above every field (today only invisible `aria-label`s exist), and restyle the form to "numbered card sections" per the approved mockup, widening the modal to fit comfortably.

## Approved direction (from visual brainstorm)
- **Section headers**: small numbered badge (indigo-50 background, indigo-600 text, rounded) + bold section title, replacing the current plain uppercase-gray `FormSection` heading.
- **Fields**: every field gets a visible `<label>` above it (small, gray-600, medium weight) in addition to keeping `aria-label` for tests/accessibility continuity. Inputs get a filled treatment: `bg-neutral-50` background, `border-neutral-200` border, `rounded-lg`, replacing the current plain white/`border-gray-300` inputs.
- **Layout**: Student Details fields arranged in a responsive two-column grid (`grid grid-cols-2 gap-3`) instead of a single stacked column.
- **Repeatable rows** (Sibling/Parent): each row becomes its own sub-card — light border, rounded, padded — with a small uppercase tag ("Sibling 1", "Parent 1") and a "Remove" text-link (red, right-aligned) replacing the current plain "Remove sibling"/"Remove parent" button. Read-only sibling fields (auto-filled from the linked student) get a visibly muted style (lighter background/text) to distinguish them from editable fields.
- **Modal width**: widen from the shared `Modal` component's current `max-w-lg` (512px) to `max-w-2xl` (672px) for this form specifically, without affecting other consumers of `Modal` (Staff's detail modal also uses it).
- **Disabled fields** (Division, Status): keep read-only styling but make it visually consistent with the new filled-input look (muted background/text, no border emphasis).
- **Save button**: unchanged (`rounded-full bg-neutral-900`), stays anchored bottom-right.

## Scope
- `Modal.tsx`: add an optional `maxWidthClassName` prop (default `"max-w-lg"`, matching current behavior for all other callers) so `StudentDetailModal` can opt into `max-w-2xl` without changing Staff's modal or any other consumer.
- `FormSection.tsx`: add the numbered badge, accept an index number as a prop.
- `StudentDetailModal.tsx`: full restyle — every field wrapped in a labeled block, grid layout for Student Details, sub-card styling for Sibling/Parent rows.
- No changes to component props/behavior, state, save logic, or the API — this is styling and label-markup only. All existing `aria-label`s are kept as-is so the existing test suite (`student-detail-modal.test.tsx`) continues to pass unmodified; new tests only need to confirm visible labels exist.

## Out of scope
- No changes to `StaffDetailModal.tsx` or any other modal.
- No changes to color/typography elsewhere in the app.
- No new fields, validation, or backend changes (that work already shipped).
