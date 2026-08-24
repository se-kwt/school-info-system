// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSubmitGuard } from "../src/hooks/useSubmitGuard";

describe("useSubmitGuard", () => {
  afterEach(() => {
    cleanup();
  });

  it("runs the callback once when fired twice in the same tick", async () => {
    const work = vi.fn().mockImplementation(() => new Promise<void>((r) => setTimeout(r, 20)));

    function Harness() {
      const { isSubmitting, run } = useSubmitGuard();
      return (
        <button type="button" disabled={isSubmitting} onClick={() => void run(work)}>
          Save
        </button>
      );
    }

    render(<Harness />);
    const button = screen.getByRole("button", { name: "Save" });

    button.click();
    button.click();

    await waitFor(() => expect(work).toHaveBeenCalledTimes(1));
  });

  it("re-enables after the callback settles", async () => {
    const work = vi.fn().mockResolvedValue(undefined);

    function Harness() {
      const { isSubmitting, run } = useSubmitGuard();
      return (
        <button type="button" disabled={isSubmitting} onClick={() => void run(work)}>
          Save
        </button>
      );
    }

    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(work).toHaveBeenCalledTimes(2);
  });

  it("re-enables when the callback throws", async () => {
    const work = vi.fn().mockRejectedValue(new Error("network"));

    function Harness() {
      const { isSubmitting, run } = useSubmitGuard();
      return (
        <button type="button" disabled={isSubmitting} onClick={() => void run(work).catch(() => {})}>
          Save
        </button>
      );
    }

    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
  });
});
