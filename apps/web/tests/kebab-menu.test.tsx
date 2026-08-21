// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KebabMenu } from "../src/components/school-setup/KebabMenu";

describe("KebabMenu", () => {
  afterEach(() => cleanup());

  it("shows menu items only after the trigger is clicked", async () => {
    render(<KebabMenu label="Actions for Grade 1" items={[{ label: "Delete", onClick: vi.fn(), destructive: true }]} />);
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Actions for Grade 1" }));
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("calls the item's onClick and closes the menu", async () => {
    const onClick = vi.fn();
    render(<KebabMenu label="Actions for Grade 1" items={[{ label: "Delete", onClick }]} />);
    await userEvent.click(screen.getByRole("button", { name: "Actions for Grade 1" }));
    await userEvent.click(screen.getByText("Delete"));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });

  it("closes the menu when clicking outside", async () => {
    render(
      <div>
        <KebabMenu label="Actions for Grade 1" items={[{ label: "Delete", onClick: vi.fn() }]} />
        <button type="button">Outside</button>
      </div>
    );
    await userEvent.click(screen.getByRole("button", { name: "Actions for Grade 1" }));
    expect(screen.getByText("Delete")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });
});
