/*
  To Bill: the orders in the Store without a bill, the oldest first, with the customer and what the bill comes to;
  once the bill is made it opens right away.
*/
import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderApp } from "@/test/renderApp";
import { requests, respond } from "@/test/fakeApi";
import ToBill from "./ToBill";

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
const goods = (id, status, customerName, receivedDaysAgo, lines) => ({
  id, orderId: 100 + id, orderNumber: `ORD-00${id}`, customerName, status, receivedAt: daysAgo(receivedDaysAgo), bill: null, lines,
});
const line = (productId, name, quantity, { listPrice = null, agreedRate = null } = {}) => ({ productId, sku: `P-${productId}`, name, quantity, listPrice, agreedRate, agreedNote: null });

describe("To Bill", () => {
  it("lists only the orders in the Store, oldest first, with the customer and the amount", async () => {
    respond("GET", "/finished-goods", [
      goods(1, "IN_STORE", "Sharma Traders", 1, [line(1, "Controller", 10, { listPrice: 250, agreedRate: 200 })]),
      goods(2, "IN_STORE", "Gupta & Sons", 5, [line(2, "Sensor", 4, { listPrice: 100 }), line(3, "Probe", 2)]),
      goods(3, "BILLED", "Already Billed Ltd", 9, [line(1, "Controller", 1, { listPrice: 250 })]),
    ]);
    renderApp(<ToBill />, { role: "MARKETING_MANAGER" });

    const rows = (await screen.findAllByRole("row")).slice(1);
    expect(rows).toHaveLength(2);
    // waited longest first; the agreed rate counts, not the price list; a product without a rate is flagged
    expect(within(rows[0]).getByText("Gupta & Sons")).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent("Waiting 5 days");
    expect(rows[0]).toHaveTextContent("₹400");
    expect(rows[0]).toHaveTextContent("1 rate to enter");
    expect(within(rows[1]).getByText("Sharma Traders")).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent("₹2,000");
    expect(screen.queryByText("Already Billed Ltd")).not.toBeInTheDocument();
    expect(screen.getByText(/orders to bill/)).toHaveTextContent("2 orders to bill · about ₹2,400");
  });

  it("opens the new bill as soon as it is made", async () => {
    respond("GET", "/finished-goods", [goods(1, "IN_STORE", "Sharma Traders", 0, [line(1, "Controller", 10, { listPrice: 250 })])]);
    respond("POST", "/finished-goods/1/bill", { billNumber: "BILL-0007" });
    respond("GET", "/finished-goods/1/bill", {
      billNumber: "BILL-0007", customerName: "Sharma Traders", createdByName: "Test User", createdAt: daysAgo(0), paymentStatus: "UNPAID",
      items: [{ productId: 1, name: "Controller", quantity: 10, rate: 250, amount: 2500, listPrice: 250 }],
      gstAmount: 0, total: 2500, paid: 0, due: 2500, payments: [], cancelledBills: [], goodsStatus: "BILLED",
    });
    renderApp(<ToBill />, { role: "MARKETING_MANAGER" });

    fireEvent.click(await screen.findByRole("button", { name: /Make bill/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Make bill" }));

    expect(await screen.findByText("Bill BILL-0007")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark as paid" })).toBeInTheDocument();
    await waitFor(() => expect(requests.some((r) => r.method === "POST" && r.url === "/finished-goods/1/bill")).toBe(true));
  });

  it("someone who does not bill sees the list without the button", async () => {
    respond("GET", "/finished-goods", [goods(1, "IN_STORE", "Sharma Traders", 0, [line(1, "Controller", 10, { listPrice: 250 })])]);
    renderApp(<ToBill />, { role: "OPERATIONS_ADMIN" });

    expect(await screen.findByText("Marketing makes the bill")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Make bill/ })).not.toBeInTheDocument();
  });
});
