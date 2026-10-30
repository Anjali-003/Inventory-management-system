/*
  Both "Start production" dialogs read GET /orders/:orderItemId/production-info through RTK Query and fill the
  quantity once, when the numbers arrive.
*/
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderApp } from "@/test/renderApp";
import { fail, respond } from "@/test/fakeApi";
import ProductionStartModal from "./ProductionStartModal";
import StartProductionModal from "@/sales/orders/components/StartProductionModal";

const ORDER = { order_item_id: 7, order_id: 3, order_number: "ORD-003", product_name: "Controller", quantity: 10 };
const INFO = (max) => ({ maxProductionQuantity: max, orderedQuantity: 10, quantityCompleted: 0, quantityToProduce: 0, materialAllottedQuantity: max, materialLeftToBeAllotted: 10 - max });

describe("Start production dialogs", () => {
  it("Production's dialog offers every unit that can start", async () => {
    respond("GET", "/orders/7/production-info", INFO(6));
    renderApp(<ProductionStartModal order={ORDER} onClose={() => {}} onStarted={() => {}} />, { role: "PRODUCTION_MANAGER" });
    expect(await screen.findByLabelText("How many units do you want to start?")).toHaveValue(6);
  });

  it("the Orders dialog starts at 1, or empty when nothing can start", async () => {
    respond("GET", "/orders/7/production-info", INFO(4));
    const view = renderApp(<StartProductionModal order={ORDER} onClose={() => {}} onStarted={() => {}} />);
    expect(await screen.findByLabelText(/Quantity to start/)).toHaveValue(1);
    view.unmount();

    respond("GET", "/orders/8/production-info", INFO(0));
    renderApp(<StartProductionModal order={{ ...ORDER, order_item_id: 8 }} onClose={() => {}} onStarted={() => {}} />);
    expect(await screen.findByLabelText(/Quantity to start/)).toHaveValue(null);
  });

  it("shows why the numbers could not be loaded", async () => {
    fail("GET", "/orders/7/production-info", 404, "Order item not found");
    renderApp(<ProductionStartModal order={ORDER} onClose={() => {}} onStarted={() => {}} />, { role: "PRODUCTION_MANAGER" });
    expect(await screen.findByText("Order item not found")).toBeInTheDocument();
  });
});
