// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationBell } from "../src/components/parent/NotificationBell";

describe("NotificationBell", () => {
  afterEach(() => cleanup());

  it("does not show the popover initially", () => {
    render(<NotificationBell />);
    expect(screen.queryByText("Notifications are coming soon.")).not.toBeInTheDocument();
  });

  it("shows the popover after clicking the bell", async () => {
    render(<NotificationBell />);
    await userEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByText("Notifications are coming soon.")).toBeInTheDocument();
  });

  it("hides the popover after clicking elsewhere in the document", async () => {
    render(
      <div>
        <NotificationBell />
        <p>Elsewhere</p>
      </div>
    );
    await userEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByText("Notifications are coming soon.")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Elsewhere"));
    expect(screen.queryByText("Notifications are coming soon.")).not.toBeInTheDocument();
  });

  it("hides the popover after clicking the bell a second time", async () => {
    render(<NotificationBell />);
    const button = screen.getByRole("button", { name: "Notifications" });

    await userEvent.click(button);
    expect(screen.getByText("Notifications are coming soon.")).toBeInTheDocument();

    await userEvent.click(button);
    expect(screen.queryByText("Notifications are coming soon.")).not.toBeInTheDocument();
  });
});
