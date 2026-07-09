// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StudentsView } from "../src/components/school-setup/StudentsView";

describe("StudentsView", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("uploads the selected photo first, then includes the returned photoUrl in the create request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ photoUrl: "/uploads/students/abc.png" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 1, name: "New Student", admissionNo: "SCH-100" }), {
          status: 201,
        })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <StudentsView
        initialStudents={[]}
        classes={[{ id: 1, name: "Grade 5", section: "A" }]}
        isAdmin={true}
      />
    );

    await userEvent.type(screen.getByLabelText("Student name"), "New Student");
    await userEvent.type(screen.getByLabelText("Date of birth"), "2016-01-01");
    await userEvent.type(screen.getByLabelText("Admission number"), "SCH-100");
    await userEvent.type(screen.getByLabelText("Roll number"), "1");
    await userEvent.type(screen.getByLabelText("Parent phone"), "+15550009999");
    await userEvent.type(screen.getByLabelText("Parent name"), "A Parent");

    const file = new File(["binary"], "photo.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Student photo"), file);
    await userEvent.click(screen.getByRole("button", { name: "Create Student" }));

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/students/upload-photo",
      expect.objectContaining({ method: "POST" })
    );
    const createBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(createBody.photoUrl).toBe("/uploads/students/abc.png");
  });
});
