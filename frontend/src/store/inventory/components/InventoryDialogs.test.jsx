/*
  Inventory dialogs read their data through RTK Query (inventoryApi.js) and reset their forms with useChanged:
  the item detail, the ledger, the component search and the stock-out form.
*/
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderApp } from "@/test/renderApp";
import { fail, requests, respond } from "@/test/fakeApi";
import ItemDetailModal from "./ItemDetailModal";
import { LedgerPanel } from "./Ledger";
import ComponentCombobox from "./ComponentCombobox";
import { StockOutModal } from "./MovementModals";

const ITEM = {
  id: 5, component_id: 9, component_name: "Resistor 10k", sku: "CMP-009", unit: "pcs", quantity_on_hand: 40,
  minimum_stock_level: 10, is_active: 1, in_sync: 1, recent_movements: [],
};
const MOVE = { id: 1, type: "IN", direction: "IN", quantity: 40, sku: "CMP-009", component_name: "Resistor 10k", reason: "Opening stock", created_at: "2026-10-01 10:00:00" };

describe("Inventory dialogs", () => {
  it("item detail loads the item it was opened for", async () => {
    respond("GET", "/inventory/5", ITEM);
    renderApp(<ItemDetailModal open itemId={5} onClose={() => {}} />);
    expect(await screen.findByRole("heading", { name: "Resistor 10k" })).toBeInTheDocument();
  });

  it("item detail shows the server's error", async () => {
    fail("GET", "/inventory/5", 404, "Inventory item not found");
    renderApp(<ItemDetailModal open itemId={5} onClose={() => {}} />);
    expect(await screen.findByText("Inventory item not found")).toBeInTheDocument();
  });

  it("ledger lists movements and asks again when the filter changes", async () => {
    respond("GET", "/inventory/ledger", { rows: [MOVE], total: 1, total_in: 40, total_out: 0 });
    renderApp(<LedgerPanel />);
    expect(await screen.findAllByText(/Opening stock/)).not.toHaveLength(0);

    const before = requests.filter((r) => r.url === "/inventory/ledger").length;
    fireEvent.change(screen.getByRole("combobox", { name: "Movement" }), { target: { value: "CONSUMED" } });
    await waitFor(() => expect(requests.filter((r) => r.url === "/inventory/ledger").length).toBe(before + 1));
  });

  it("component search shows the matches for what was typed", async () => {
    respond("GET", "/inventory/components", { rows: [{ id: 9, sku: "CMP-009", name: "Resistor 10k", unit: "pcs", inventory_id: 5, is_active: 1, quantity_on_hand: 40 }], total: 1 });
    renderApp(<ComponentCombobox value={null} onSelect={() => {}} onClear={() => {}} onCreate={() => {}} />);
    const input = screen.getByRole("combobox");
    fireEvent.click(input);
    fireEvent.change(input, { target: { value: "resis" } });
    expect(await screen.findByRole("option", { name: /CMP-009/ })).toBeInTheDocument();
  });

  it("stock-out form starts empty every time it opens", async () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setOpen((o) => !o)}>toggle</button>
          <StockOutModal open={open} item={ITEM} onClose={() => {}} onSaved={() => {}} onConflict={() => {}} />
        </>
      );
    }
    renderApp(<Harness />);
    const qty = await screen.findByLabelText(/Quantity \(pcs\)/);
    fireEvent.change(qty, { target: { value: "7" } });
    expect(qty).toHaveValue("7");

    fireEvent.click(screen.getByText("toggle"));
    await waitFor(() => expect(screen.queryByLabelText(/Quantity \(pcs\)/)).toBeNull());
    fireEvent.click(screen.getByText("toggle"));
    expect(await screen.findByLabelText(/Quantity \(pcs\)/)).toHaveValue("");
  });
});
