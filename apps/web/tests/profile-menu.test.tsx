// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileMenu } from "../src/components/parent/ProfileMenu";

describe("ProfileMenu", () => {
  afterEach(() => cleanup());

  it("does not show the menu initially", () => {
    render(<ProfileMenu initials="PS" />);
    expect(screen.queryByText("Profile")).not.toBeInTheDocument();
  });

  it("shows the menu after clicking the avatar", async () => {
    render(<ProfileMenu initials="PS" />);
    await userEvent.click(screen.getByRole("button", { name: "Profile menu" }));
    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Logout")).toBeInTheDocument();
  });

  it("links Profile and Settings to their respective pages", async () => {
    render(<ProfileMenu initials="PS" />);
    await userEvent.click(screen.getByRole("button", { name: "Profile menu" }));
    expect(screen.getByText("Profile")).toHaveAttribute("href", "/parent/profile");
    expect(screen.getByText("Settings")).toHaveAttribute("href", "/parent/settings");
  });

  it("renders Logout as a submit button inside a form posting to /api/auth/logout", async () => {
    render(<ProfileMenu initials="PS" />);
    await userEvent.click(screen.getByRole("button", { name: "Profile menu" }));
    const logoutButton = screen.getByRole("button", { name: "Logout" });
    expect(logoutButton).toHaveAttribute("type", "submit");
    expect(logoutButton.closest("form")).toHaveAttribute("action", "/api/auth/logout");
    expect(logoutButton.closest("form")).toHaveAttribute("method", "POST");
  });

  it("hides the menu after clicking elsewhere in the document", async () => {
    render(
      <div>
        <ProfileMenu initials="PS" />
        <p>Elsewhere</p>
      </div>
    );
    await userEvent.click(screen.getByRole("button", { name: "Profile menu" }));
    expect(screen.getByText("Profile")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Elsewhere"));
    expect(screen.queryByText("Profile")).not.toBeInTheDocument();
  });

  it("hides the menu after clicking the avatar a second time", async () => {
    render(<ProfileMenu initials="PS" />);
    const button = screen.getByRole("button", { name: "Profile menu" });

    await userEvent.click(button);
    expect(screen.getByText("Profile")).toBeInTheDocument();

    await userEvent.click(button);
    expect(screen.queryByText("Profile")).not.toBeInTheDocument();
  });

  it("hides the menu after clicking the Profile link", async () => {
    render(<ProfileMenu initials="PS" />);
    await userEvent.click(screen.getByRole("button", { name: "Profile menu" }));
    expect(screen.getByText("Profile")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Profile"));
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });

  it("hides the menu after clicking the Settings link", async () => {
    render(<ProfileMenu initials="PS" />);
    await userEvent.click(screen.getByRole("button", { name: "Profile menu" }));
    expect(screen.getByText("Settings")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Settings"));
    expect(screen.queryByText("Profile")).not.toBeInTheDocument();
  });
});
