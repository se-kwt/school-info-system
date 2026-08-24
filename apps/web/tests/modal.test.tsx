// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal } from "../src/components/school-setup/Modal";

describe("Modal", () => {
  afterEach(() => cleanup());

  it("renders its children", () => {
    render(
      <Modal title="Modal title" onClose={() => {}}>
        <p>Modal content</p>
      </Modal>
    );
    expect(screen.getByText("Modal content")).toBeInTheDocument();
  });

  it("calls onClose when the backdrop is clicked", async () => {
    const onClose = vi.fn();
    render(
      <Modal title="Modal title" onClose={onClose}>
        <p>Modal content</p>
      </Modal>
    );
    await userEvent.click(screen.getByTestId("modal-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when the panel content is clicked", async () => {
    const onClose = vi.fn();
    render(
      <Modal title="Modal title" onClose={onClose}>
        <p>Modal content</p>
      </Modal>
    );
    await userEvent.click(screen.getByText("Modal content"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(
      <Modal title="Modal title" onClose={onClose}>
        <p>Modal content</p>
      </Modal>
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("defaults to max-w-lg when no maxWidthClassName is given", () => {
    render(
      <Modal title="Modal title" onClose={() => {}}>
        <p>Modal content</p>
      </Modal>
    );
    expect(screen.getByTestId("modal-backdrop").firstElementChild).toHaveClass("max-w-lg");
  });

  it("uses a custom maxWidthClassName when given", () => {
    render(
      <Modal title="Modal title" onClose={() => {}} maxWidthClassName="max-w-2xl">
        <p>Modal content</p>
      </Modal>
    );
    const panel = screen.getByTestId("modal-backdrop").firstElementChild;
    expect(panel).toHaveClass("max-w-2xl");
    expect(panel).not.toHaveClass("max-w-lg");
  });
});

describe("Modal accessibility", () => {
  afterEach(() => cleanup());

  it("exposes itself as a labelled modal dialog", () => {
    render(
      <Modal title="Edit student" onClose={() => {}}>
        <button type="button">Inside</button>
      </Modal>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Edit student");
  });

  it("moves focus into the dialog on open", () => {
    render(
      <Modal title="Edit student" onClose={() => {}}>
        <button type="button">First</button>
        <button type="button">Second</button>
      </Modal>
    );

    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
  });

  it("traps Tab inside the dialog", async () => {
    render(
      <Modal title="Edit student" onClose={() => {}}>
        <button type="button">First</button>
        <button type="button">Last</button>
      </Modal>
    );

    const first = screen.getByRole("button", { name: "First" });
    const last = screen.getByRole("button", { name: "Last" });

    last.focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(first);

    first.focus();
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(last);
  });

  it("returns focus to the trigger on close", async () => {
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open</button>
          {open && (
            <Modal title="Edit student" onClose={() => setOpen(false)}>
              <button type="button">Inside</button>
            </Modal>
          )}
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open" });
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");

    expect(document.activeElement).toBe(trigger);
  });

  it("still closes on Escape and on backdrop click", async () => {
    const onClose = vi.fn();
    render(
      <Modal title="Edit student" onClose={onClose}>
        <button type="button">Inside</button>
      </Modal>
    );

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByTestId("modal-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
