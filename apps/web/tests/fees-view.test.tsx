// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FeesView } from "../src/components/fees/FeesView";

const classes = [{ id: 1, gradeName: "Grade 5", section: "A" }];

const feeStructures = [{ id: 10, term: "Term 1", amount: 5000, dueDate: "2026-09-01" }];

const students = [
  { studentId: 100, name: "Asha Rao", amountPaid: 0, amount: 5000, status: "unpaid" as const },
];

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

function stubRosterFetch(overrides?: { record?: (url: string, init?: RequestInit) => Response | undefined }) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const override = overrides?.record?.(url, init);
    if (override) return Promise.resolve(override);
    if (url.startsWith("/api/fee-structures")) {
      return Promise.resolve(jsonResponse({ feeStructures }));
    }
    if (url.startsWith("/api/fee-payments/history")) {
      return Promise.resolve(jsonResponse({ payments: [] }));
    }
    if (url.startsWith("/api/fee-payments")) {
      return Promise.resolve(jsonResponse({ students }));
    }
    return Promise.resolve(jsonResponse({}));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("FeesView", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("requires a payment mode before submitting", async () => {
    const fetchMock = stubRosterFetch();

    render(<FeesView classes={classes} role="accountant" />);

    await waitFor(() => expect(screen.getByText("Asha Rao")).toBeInTheDocument());
    const callsBeforeSubmit = fetchMock.mock.calls.length;

    await userEvent.type(screen.getByLabelText(/payment amount/i), "2000");
    await userEvent.click(screen.getByRole("button", { name: /record payment/i }));

    expect(screen.getByText(/select a payment mode/i)).toBeInTheDocument();
    expect(fetchMock.mock.calls.length).toBe(callsBeforeSubmit);
  });

  it("sends mode and reference with the payment", async () => {
    const fetchMock = stubRosterFetch({
      record: (url, init) => {
        if (url === "/api/fee-payments" && init?.method === "POST") {
          return jsonResponse({ amountPaid: 2000, status: "partial", receiptNo: "R-10-00001" });
        }
        return undefined;
      },
    });

    render(<FeesView classes={classes} role="accountant" />);

    await waitFor(() => expect(screen.getByText("Asha Rao")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/payment amount/i), "2000");
    await userEvent.selectOptions(screen.getByLabelText(/payment mode/i), "upi");
    await userEvent.type(screen.getByLabelText(/reference/i), "UPI-9981");
    await userEvent.click(screen.getByRole("button", { name: /record payment/i }));

    await waitFor(() => expect(screen.getByText("Payment recorded")).toBeInTheDocument());

    const postCall = fetchMock.mock.calls.find(
      ([url, init]) => url === "/api/fee-payments" && (init as RequestInit | undefined)?.method === "POST"
    );
    expect(postCall).toBeDefined();
    const body = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(body.mode).toBe("upi");
    expect(body.reference).toBe("UPI-9981");
  });

  it("shows instalment history with mode, receipt number, reference and recorder", async () => {
    stubRosterFetch({
      record: (url) => {
        if (url.startsWith("/api/fee-payments/history")) {
          return jsonResponse({
            payments: [
              {
                id: 1,
                amountPaid: 2000,
                paidDate: "2026-08-01",
                mode: "upi",
                receiptNo: "R-10-00001",
                reference: "UPI-9981",
                recordedByName: "Priya Iyer",
              },
            ],
          });
        }
        return undefined;
      },
    });

    render(<FeesView classes={classes} role="accountant" />);

    await waitFor(() => expect(screen.getByText("Asha Rao")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /show history/i }));

    await waitFor(() => expect(screen.getByText("R-10-00001")).toBeInTheDocument());
    expect(screen.getByText("UPI-9981")).toBeInTheDocument();
    expect(screen.getByText("Priya Iyer")).toBeInTheDocument();
    expect(screen.getByText("₹2,000.00")).toBeInTheDocument();
  });

  it("renders roster amounts with separators and two decimals", async () => {
    stubRosterFetch({
      record: (url) => {
        if (url.startsWith("/api/fee-payments") && !url.includes("history")) {
          return jsonResponse({
            students: [
              {
                studentId: 100,
                name: "Asha Rao",
                amountPaid: 1234567.5,
                amount: 2000000,
                status: "partial" as const,
              },
            ],
          });
        }
        return undefined;
      },
    });

    render(<FeesView classes={classes} role="accountant" />);

    await waitFor(() => expect(screen.getByText("Asha Rao")).toBeInTheDocument());
    expect(screen.getByText("₹12,34,567.50")).toBeInTheDocument();
    expect(screen.getByText("₹20,00,000.00")).toBeInTheDocument();
  });
});
