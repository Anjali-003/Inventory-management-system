/*
  Marketing dashboard: the figures answer the Marketing Manager's questions.
    Your turn          revised quantities to answer + drafts to send + orders to bill (the line under Orders)
    Due for delivery   open orders late or due within 7 days that are not all with the customer yet
    Money to collect   what the bills still owe
*/
import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderApp } from "@/test/renderApp";
import { respond } from "@/test/fakeApi";
import MarketingView from "./MarketingView";

const day = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

let nextId = 1;
const order = (status, { due = null, wanted = null, units = 50, given = 0 } = {}) => ({
  id: nextId, order_number: `ORD-${String(nextId++).padStart(3, "0")}`, approval_status: status, customer_name: "Sharma Traders",
  created_at: "2026-10-01 10:00:00", required_by_date: wanted, estimated_delivery_date: due, delivered_units: given,
  items: [{ product_id: 1, name: "Controller", sku: "P-CTRL", quantity: units, price: 250 }],
  totals: { lines: 1, quantity: units, value: units * 250, unpriced: 0 }, events: [],
});

/* the tile whose label is `label` */
const tile = (label) => screen.getByText(label).closest("a, button");

describe("Marketing dashboard figures", () => {
  it("counts what is due for delivery: late or within 7 days, not all given out, still open", async () => {
    respond("GET", "/marketing-orders", [
      order("APPROVED", { due: day(-3) }), // late
      order("PENDING_APPROVAL", { due: day(2) }), // due in 2 days
      order("APPROVED", { due: day(1), units: 10, given: 10 }), // all given out: not due
      order("APPROVED", { due: day(30) }), // far away
      order("REJECTED", { due: day(-1) }), // not going ahead
      order("APPROVED"), // no date
    ]);
    renderApp(<MarketingView />, { role: "MARKETING_MANAGER" });

    const due = await screen.findByText("Due for delivery", { selector: "span" });
    const figure = due.closest("button");
    await waitFor(() => expect(figure).toHaveTextContent("1 late · 1 this week"));
    fireEvent.click(figure); // the rejected order is shown first: the figure opens the deliveries
    expect(await screen.findByText("Late by 3 days")).toBeInTheDocument();
    expect(screen.getByText("Due in 2 days")).toBeInTheDocument();
  });

  it("counts an order by the customer's date when Operations plans to deliver later", async () => {
    respond("GET", "/marketing-orders", [order("APPROVED", { wanted: day(2), due: day(20) })]);
    renderApp(<MarketingView />, { role: "MARKETING_MANAGER" });

    expect(await screen.findByText("Due in 2 days")).toBeInTheDocument();
    expect(screen.getByText(/^Customer wants .* · Operations /)).toBeInTheDocument();
  });

  it("Your turn adds up the revised quantities to answer, the drafts to send and the orders to bill", async () => {
    respond("GET", "/marketing-orders", [order("QUANTITY_REVISED"), order("DRAFT"), order("DRAFT"), order("APPROVED")]);
    respond("GET", "/sales/summary", { net: 0, collected: 0, toCollect: 0, owed: [], toBill: 3 });
    renderApp(<MarketingView />, { role: "MARKETING_MANAGER" });

    expect(await screen.findByText("1 to answer · 2 drafts to send · 3 to bill")).toBeInTheDocument();
    expect(screen.getByText("Your turn:", { exact: false })).toBeInTheDocument();
  });

  it("Money to collect shows what the bills still owe and how old the oldest is", async () => {
    respond("GET", "/sales/summary", { net: 0, collected: 0, toCollect: 12500, owed: [{ billNumber: "BILL-1", customer: "Sharma Traders", days: 34, due: 12500 }], toBill: 0 });
    renderApp(<MarketingView />, { role: "MARKETING_MANAGER" });

    expect(await screen.findByText("Oldest bill is 34 days old")).toBeInTheDocument();
    expect(tile("Money to collect")).toHaveAttribute("href", "/bills?show=open");
  });

  it("says when nothing is waiting", async () => {
    renderApp(<MarketingView />, { role: "MARKETING_MANAGER" });
    expect(await screen.findByText("Nothing is waiting for you")).toBeInTheDocument();
    expect(screen.getByText("Nothing due this week")).toBeInTheDocument();
    expect(screen.getByText("Every bill is paid")).toBeInTheDocument();
  });

  it("Sales & billing compares with last month, lists the top customers and splits the money out by bill age", async () => {
    respond("GET", "/sales/summary", {
      net: 12000, collected: 5000, toCollect: 9000, toBill: 0, lastMonth: { net: 10000, collected: 0 },
      owed: [{ billNumber: "BILL-1", customer: "Sharma Traders", days: 95, due: 9000 }], ageing: [0, 0, 0, 9000],
      byCustomer: [{ name: "Sharma Traders", bills: 2, total: 12000 }],
    });
    renderApp(<MarketingView />, { role: "MARKETING_MANAGER" });

    expect(await screen.findByText("vs ₹10,000 last month", { exact: false })).toHaveTextContent("up20%");
    expect(screen.getByText("Last month ₹0")).toBeInTheDocument(); // nothing received last month: no %
    expect(screen.getByText("Top customers")).toBeInTheDocument();
    expect(screen.getByText("2 bills", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Over 90 days").nextSibling).toHaveTextContent("₹9,000");
  });

  it("lists the regular customers going quiet, the longest silence first", async () => {
    respond("GET", "/customers", [
      { id: 1, name: "Quiet Co", orders: 3, daysSinceOrder: 50, usualGapDays: 30, goingQuiet: true },
      { id: 2, name: "Silent Co", orders: 3, daysSinceOrder: 60, usualGapDays: 20, goingQuiet: true },
      { id: 3, name: "Busy Co", orders: 5, daysSinceOrder: 2, usualGapDays: 7, goingQuiet: false },
    ]);
    renderApp(<MarketingView />, { role: "MARKETING_MANAGER" });

    expect(await screen.findByText("Silent Co")).toBeInTheDocument();
    const names = screen.getAllByText(/^(Silent|Quiet|Busy) Co$/).map((el) => el.textContent);
    expect(names).toEqual(["Silent Co", "Quiet Co"]); // 3.0x late before 1.7x; Busy Co is on time
    expect(screen.getByText("No order for 60 days · usually every 20")).toBeInTheDocument();
    expect(screen.getByText("3.0× late")).toBeInTheDocument();
  });
});
