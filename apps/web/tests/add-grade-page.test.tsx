// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

import { AddGradeForm } from "../src/components/school-setup/AddGradeForm";

describe("AddGradeForm", () => {
  afterEach(() => {
    cleanup();
    pushMock.mockClear();
  });

  it("posts the entered name and redirects to the grades list on success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 3, name: "Grade 3" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AddGradeForm />);
    await userEvent.type(screen.getByLabelText("Grade name"), "Grade 3");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/grades",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "Grade 3" }) })
    );
    expect(pushMock).toHaveBeenCalledWith("/dashboard/grades");
    vi.unstubAllGlobals();
  });

  it("shows a server error and does not redirect on failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "A grade with this name already exists" }), { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AddGradeForm />);
    await userEvent.type(screen.getByLabelText("Grade name"), "Grade 1");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("A grade with this name already exists")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
