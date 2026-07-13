// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { SchoolProfileSettings } from "../src/components/settings/SchoolProfileSettings";

describe("SchoolProfileSettings", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows the current logo (or initials fallback) and school name", () => {
    render(<SchoolProfileSettings initialLogoUrl={null} schoolName="Greenwood High" />);
    expect(screen.getByText("GH")).toBeInTheDocument();
    expect(screen.getByText("Greenwood High")).toBeInTheDocument();
  });

  it("uploads a selected file and displays the returned logo", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ logoUrl: "/uploads/school/new-logo.png" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SchoolProfileSettings initialLogoUrl={null} schoolName="Greenwood High" />);

    const file = new File(["abc"], "logo.png", { type: "image/png" });
    const input = screen.getByLabelText("School Logo") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole("img", { name: "Greenwood High" })).toHaveAttribute(
        "src",
        "/uploads/school/new-logo.png"
      );
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/school/logo",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("shows an error message when the upload fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Only PNG, JPEG, and WebP images are allowed" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SchoolProfileSettings initialLogoUrl={null} schoolName="Greenwood High" />);

    const file = new File(["abc"], "logo.gif", { type: "image/gif" });
    const input = screen.getByLabelText("School Logo") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("Only PNG, JPEG, and WebP images are allowed")).toBeInTheDocument();
    });
  });
});
