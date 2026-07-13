"use client";

import { useEffect } from "react";

export function Modal({
  children,
  onClose,
  maxWidthClassName = "max-w-lg",
}: {
  children: React.ReactNode;
  onClose: () => void;
  maxWidthClassName?: string;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      data-testid="modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className={`flex max-h-[85vh] w-full ${maxWidthClassName} flex-col overflow-hidden rounded-2xl bg-white shadow-xl`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-scroll flex flex-col gap-4 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
