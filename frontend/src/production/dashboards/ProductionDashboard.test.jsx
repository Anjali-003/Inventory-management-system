/*
  Production dashboard: the figures answer the Production Manager's daily questions and open their list.
    Due this week   open lines late or due within 7 days
    Ready to start  units whose materials are here
    Held up         lines waiting for the Store or Operations (the oldest Store request in red past 2 days)
  The line under the title says the most pressing thing; drafts never count.
*/
import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderApp } from "@/test/renderApp";
import { respond } from "@/test/fakeApi";
import ProductionDashboard from "./ProductionDashboard";

const day = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

let next = 1;
const line = (fields = {}) => {
  const n = next++;
  return {
    id: null, order_item_id: n, order_id: n, order_number: `ORD-10${n}`, product_name: `Product ${n}`, customer_name: "Gupta & Sons", item_count: 1, item_index: 1,
    ordered_quantity: 10, approval_status: "APPROVED", inventory_issued_at: "2026-10-01 10:00:00", order_status: "PENDING",
    material_status: "OK", status: "NOT_STARTED", quantity_to_produce: 0, quantity_completed: 0, quantity_in_production: 0, remaining_to_start: 10,
    max_production_quantity: 0, material_allotted_quantity: 0, material_left_to_allot: 10, material_request_outstanding_quantity: 0,
    order_created_at: "2026-10-01 10:00:00", ...fields,
  };
};

const LINES = () => [
  line({ product_name: "Late One", required_by_date: day(-2), max_production_quantity: 10, material_allotted_quantity: 10, material_left_to_allot: 0 }),
  line({ product_name: "Ready One", estimated_delivery_date: day(30), max_production_quantity: 8, material_allotted_quantity: 8, material_left_to_allot: 2 }),
  line({ product_name: "Making One", required_by_date: day(3), id: 50, status: "IN_PRODUCTION", order_status: "IN_PRODUCTION", quantity_to_produce: 10, quantity_completed: 4, quantity_in_production: 6, remaining_to_start: 0, material_allotted_quantity: 10, material_left_to_allot: 0 }),
  line({ product_name: "Asked Store", material_request_outstanding_quantity: 30, material_requested_at: new Date(Date.now() - 4 * 86400000).toISOString() }),
  line({ product_name: "Failed QC", id: 51, status: "COMPLETED", quantity_to_produce: 10, quantity_completed: 10, remaining_to_start: 0, material_allotted_quantity: 10, material_left_to_allot: 0, rework_status: "NEEDS_REWORK", qc_remarks: "Loose wire" }),
  line({ product_name: "A Draft", approval_status: "DRAFT", inventory_issued_at: null, required_by_date: day(-5) }),
];

const kpi = (label) => screen.getByText(label, { selector: "p" }).closest("a, button");

describe("Production dashboard", () => {
  it("answers what is due, what can start and what is held up", async () => {
    respond("GET", "/production", LINES());
    renderApp(<ProductionDashboard />, { role: "PRODUCTION_MANAGER" });

    expect(await screen.findByText("1 order past the delivery date. Make it first.")).toBeInTheDocument();
    // the numbers count up from 0, so wait for them to land
    await waitFor(() => expect(kpi("Due this week")).toHaveTextContent("Due this week21 late · 1 this week"));
    expect(kpi("Ready to start")).toHaveTextContent("18");
    expect(kpi("Being made")).toHaveTextContent("6");
    expect(kpi("Held up")).toHaveTextContent("Oldest Store request 4 days");
    await waitFor(() => expect(kpi("Failed QC")).toHaveTextContent("Failed QC1"));
    expect(kpi("Failed QC")).toHaveAttribute("href", "/qc-failed");
    expect(screen.getByText("QC: Loose wire")).toBeInTheDocument();
  });

  it("a figure opens its list, and a row has the one button that moves it on", async () => {
    respond("GET", "/production", LINES());
    renderApp(<ProductionDashboard />, { role: "PRODUCTION_MANAGER" });

    // Due soon opens first (late first): the late line can start
    const late = (await screen.findByText("Late by 2 days")).closest("li");
    expect(within(late).getByText("Gupta & Sons · Late One")).toBeInTheDocument();
    expect(within(late).getByRole("button", { name: /Start/ })).toBeInTheDocument();

    fireEvent.click(kpi("Held up"));
    const held = (await screen.findByText("Store has had the request 4 days")).closest("li");
    expect(within(held).getByText("Gupta & Sons · Asked Store")).toBeInTheDocument();
    expect(within(held).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/A Draft/)).not.toBeInTheDocument();
  });
});
