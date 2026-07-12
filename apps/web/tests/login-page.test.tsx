// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import LoginPage from "../src/app/login/page";

describe("LoginPage", () => {
  beforeEach(() => {
    pushMock.mockClear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
  });

  it("moves to the OTP step after a successful send-otp call", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );

    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("Phone number"), "+10000000001");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Verification code")).toBeInTheDocument();
    });
  });

  it("shows the test OTP as a toast when the send-otp response includes a code", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, code: "654321" }), { status: 200 })
    );

    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("Phone number"), "+10000000001");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));

    await waitFor(() => {
      expect(screen.getByText("654321")).toBeInTheDocument();
    });
  });

  it("does not show a toast when the send-otp response has no code", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );

    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("Phone number"), "+10000000001");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() => screen.getByLabelText("Verification code"));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows an inline error for an unregistered phone number", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Phone number is not registered" }), { status: 404 })
    );

    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("Phone number"), "+19999999999");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));

    await waitFor(() => {
      expect(screen.getByText("Phone number is not registered")).toBeInTheDocument();
    });
  });

  it("navigates to /dashboard after a successful code verification for a staff role", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, role: "teacher" }), { status: 200 })
      );

    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("Phone number"), "+10000000001");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() => screen.getByLabelText("Verification code"));

    await userEvent.type(screen.getByLabelText("Verification code"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("navigates to /parent after a successful code verification for the parent role", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, role: "parent" }), { status: 200 })
      );

    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("Phone number"), "+10000000004");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() => screen.getByLabelText("Verification code"));

    await userEvent.type(screen.getByLabelText("Verification code"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/parent");
    });
  });

  it("shows an inline error for an incorrect code", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "INVALID_CODE" }), { status: 401 })
      );

    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("Phone number"), "+10000000001");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() => screen.getByLabelText("Verification code"));

    await userEvent.type(screen.getByLabelText("Verification code"), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => {
      expect(screen.getByText("Incorrect or expired code. Try again")).toBeInTheDocument();
    });
  });

  it("returns to the phone step when Change number is clicked", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );

    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("Phone number"), "+10000000001");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() => screen.getByLabelText("Verification code"));

    await userEvent.click(screen.getByRole("button", { name: "Change number" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Phone number")).toBeInTheDocument();
    });
  });
});
