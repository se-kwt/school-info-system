// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal } from "../src/components/school-setup/Modal";

describe("Modal", () => {
  afterEach(() => cleanup());

  it("renders its children", () => {
    render(
      <Modal onClose={() => {}}>
        <p>Modal content</p>
      </Modal>
    );
    expect(screen.getByText("Modal content")).toBeInTheDocument();
  });

  it("calls onClose when the backdrop is clicked", async () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose}>
        <p>Modal content</p>
      </Modal>
    );
    await userEvent.click(screen.getByTestId("modal-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when the panel content is clicked", async () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose}>
        <p>Modal content</p>
      </Modal>
    );
    await userEvent.click(screen.getByText("Modal content"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose}>
        <p>Modal content</p>
      </Modal>
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("defaults to max-w-lg when no maxWidthClassName is given", () => {
    render(
      <Modal onClose={() => {}}>
        <p>Modal content</p>
      </Modal>
    );
    expect(screen.getByTestId("modal-backdrop").firstElementChild).toHaveClass("max-w-lg");
  });

  it("uses a custom maxWidthClassName when given", () => {
    render(
      <Modal onClose={() => {}} maxWidthClassName="max-w-2xl">
        <p>Modal content</p>
      </Modal>
    );
    const panel = screen.getByTestId("modal-backdrop").firstElementChild;
    expect(panel).toHaveClass("max-w-2xl");
    expect(panel).not.toHaveClass("max-w-lg");
  });
});
