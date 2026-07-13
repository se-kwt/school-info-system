// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationBell } from "../src/components/parent/NotificationBell";

function mockFetchOnce(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({ ok, json: async () => body });
}

describe("NotificationBell", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows no badge when there are no unread notifications", async () => {
    vi.stubGlobal("fetch", mockFetchOnce({ notifications: [], unreadCount: 0 }));
    render(<NotificationBell />);
    await waitFor(() => expect(screen.queryByTestId("unread-badge")).not.toBeInTheDocument());
  });

  it("shows an unread count badge", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchOnce({
        notifications: [
          {
            id: 1,
            type: "assignment_published",
            title: "Chapter 3 worksheet",
            body: "Math · Due 2026-08-01",
            relatedId: 5,
            readAt: null,
            createdAt: "2026-07-01T00:00:00.000Z",
          },
        ],
        unreadCount: 1,
      })
    );
    render(<NotificationBell />);
    await waitFor(() => expect(screen.getByTestId("unread-badge")).toHaveTextContent("1"));
  });

  it("lists notifications in the dropdown after clicking the bell", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchOnce({
        notifications: [
          {
            id: 1,
            type: "assignment_published",
            title: "Chapter 3 worksheet",
            body: "Math · Due 2026-08-01",
            relatedId: 5,
            readAt: null,
            createdAt: "2026-07-01T00:00:00.000Z",
          },
        ],
        unreadCount: 1,
      })
    );
    render(<NotificationBell />);
    await waitFor(() => expect(screen.getByTestId("unread-badge")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByText("Chapter 3 worksheet")).toBeInTheDocument();
    expect(screen.getByText("Math · Due 2026-08-01")).toBeInTheDocument();
  });

  it("shows a placeholder message when there are no notifications", async () => {
    vi.stubGlobal("fetch", mockFetchOnce({ notifications: [], unreadCount: 0 }));
    render(<NotificationBell />);
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByText("No notifications yet")).toBeInTheDocument();
  });

  it("marks a notification read on click and calls the mark-read endpoint", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/notifications") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            notifications: [
              {
                id: 1,
                type: "assignment_published",
                title: "Chapter 3 worksheet",
                body: "Math · Due 2026-08-01",
                relatedId: 5,
                readAt: null,
                createdAt: "2026-07-01T00:00:00.000Z",
              },
            ],
            unreadCount: 1,
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<NotificationBell />);
    await waitFor(() => expect(screen.getByTestId("unread-badge")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Notifications" }));
    await userEvent.click(screen.getByText("Chapter 3 worksheet"));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/notifications/1/read",
        expect.objectContaining({ method: "POST" })
      )
    );
    await waitFor(() => expect(screen.queryByTestId("unread-badge")).not.toBeInTheDocument());
  });
});
