/*
  Production page: product lines in tabs by what there is to do, each card leading with its next step.
  Drafts and rejected orders never show; the page opens on the first tab with work in it.
*/
import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderApp } from "@/test/renderApp";
import { requests, respond } from "@/test/fakeApi";
import Production from "./Production";

let next = 1;
const line = (fields = {}) => {
  const n = next++;
  return {
    id: null, order_item_id: n, order_id: n, order_number: `ORD-00${n}`, product_name: `Product ${n}`, customer_name: "Sharma Traders", item_count: 1, item_index: 1,
    ordered_quantity: 10, approval_status: "APPROVED", inventory_issued_at: "2026-10-01 10:00:00", order_status: "PENDING",
    material_status: "OK", status: "NOT_STARTED", quantity_to_produce: 0, quantity_completed: 0, quantity_in_production: 0, remaining_to_start: 10,
    max_production_quantity: 0, material_allotted_quantity: 0, material_left_to_allot: 10, material_request_outstanding_quantity: 0,
    order_created_at: `2026-10-0${n} 10:00:00`, ...fields,
  };
};

const LINES = () => [
  line({ product_name: "Ready One", max_production_quantity: 10, material_allotted_quantity: 10, material_left_to_allot: 0 }),
  line({ product_name: "Making One", id: 50, status: "IN_PRODUCTION", order_status: "IN_PRODUCTION", quantity_to_produce: 10, quantity_completed: 4, quantity_in_production: 6, remaining_to_start: 0, material_allotted_quantity: 10, material_left_to_allot: 0 }),
  line({ product_name: "Needs Parts" }),
  line({ product_name: "Asked Store", material_request_outstanding_quantity: 30, material_requested_at: new Date(Date.now() - 3 * 86400000).toISOString() }),
  line({ product_name: "A Draft", approval_status: "DRAFT", inventory_issued_at: null }),
  line({ product_name: "All Made", status: "COMPLETED", quantity_to_produce: 10, quantity_completed: 10, remaining_to_start: 0, material_allotted_quantity: 10, material_left_to_allot: 0 }),
];

const tab = (name) => screen.getByRole("button", { name: new RegExp(`^${name}`) });

describe("Production page", () => {
  it("opens on Ready to start, counts every tab and leaves drafts out", async () => {
    respond("GET", "/production", LINES());
    renderApp(<Production />, { role: "PRODUCTION_MANAGER" });

    expect(await screen.findByText("Sharma Traders · Ready One")).toBeInTheDocument();
    expect(tab("Ready to start")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Start 10 units: their materials are here")).toBeInTheDocument();
    for (const name of ["Ready to start", "Being made", "Need materials", "Held up", "Done"]) expect(tab(name)).toHaveTextContent("1");

    fireEvent.click(tab("Need materials"));
    expect(await screen.findByText("Ask the Store for materials for 10 units")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ask Store for materials/ })).toBeInTheDocument();

    fireEvent.click(tab("Held up"));
    expect(await screen.findByText("Waiting for the Store to hand over the materials (asked 3 days ago)")).toBeInTheDocument();
    expect(screen.queryByText(/A Draft/)).not.toBeInTheDocument();
  });

  it("records finished units of a line being made", async () => {
    respond("GET", "/production", LINES());
    respond("POST", "/production/50/update-progress", { ok: true });
    renderApp(<Production />, { role: "PRODUCTION_MANAGER" });

    await screen.findByText("Sharma Traders · Ready One");
    fireEvent.click(tab("Being made"));
    const card = (await screen.findByText("Sharma Traders · Making One")).closest("article");
    expect(card).toHaveTextContent("4 of 10 made");
    fireEvent.click(within(card).getByRole("button", { name: /Record finished units/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(requests.find((r) => r.url === "/production/50/update-progress")?.data).toEqual({ quantity: 6 }));
  });

  it("someone who only looks sees the cards without buttons", async () => {
    respond("GET", "/production", LINES());
    renderApp(<Production />, { role: "QUALITY_FG_MANAGER" });

    await screen.findByText("Sharma Traders · Ready One");
    fireEvent.click(tab("Being made"));
    expect(await screen.findByText("Sharma Traders · Making One")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Record finished units/ })).not.toBeInTheDocument();
  });
});
