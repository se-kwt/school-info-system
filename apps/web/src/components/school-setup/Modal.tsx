"use client";

import { useEffect, useId, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  children,
  title,
  onClose,
  maxWidthClassName = "max-w-lg",
}: {
  children: React.ReactNode;
  title: string;
  onClose: () => void;
  maxWidthClassName?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Call sites pass an inline onClose (a new function identity on every
  // render), and typing into a controlled field re-renders the parent on
  // every keystroke. Keeping onClose out of the effect's dependency array
  // (via this ref) means the effect below only runs once per mount, so it
  // doesn't re-steal focus away from whatever the user is actively editing.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;

    const firstFocusable = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (firstFocusable ?? panel)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;

      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally mount-only, see comment above
  }, []);

  return (
    <div
      data-testid="modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`flex max-h-[85vh] w-full ${maxWidthClassName} flex-col overflow-hidden rounded-2xl bg-white shadow-xl`}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="sr-only">
          {title}
        </h2>
        <div className="modal-scroll flex flex-col gap-4 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
