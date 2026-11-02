/*
  Production's start dialog reads GET /orders/:orderItemId/production-info through RTK Query
  and fills the quantity once, when the numbers arrive.
*/
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderApp } from "@/test/renderApp";
import { fail, respond } from "@/test/fakeApi";
import ProductionStartModal from "./ProductionStartModal";

const ORDER = { order_item_id: 7, order_id: 3, order_number: "ORD-003", product_name: "Controller", quantity: 10 };
const INFO = (max) => ({ maxProductionQuantity: max, orderedQuantity: 10, quantityCompleted: 0, quantityToProduce: 0, materialAllottedQuantity: max, materialLeftToBeAllotted: 10 - max });

describe("Start production dialogs", () => {
  it("Production's dialog offers every unit that can start", async () => {
    respond("GET", "/orders/7/production-info", INFO(6));
    renderApp(<ProductionStartModal order={ORDER} onClose={() => {}} onStarted={() => {}} />, { role: "PRODUCTION_MANAGER" });
    expect(await screen.findByLabelText("How many units do you want to start?")).toHaveValue(6);
  });

  it("shows why the numbers could not be loaded", async () => {
    fail("GET", "/orders/7/production-info", 404, "Order item not found");
    renderApp(<ProductionStartModal order={ORDER} onClose={() => {}} onStarted={() => {}} />, { role: "PRODUCTION_MANAGER" });
    expect(await screen.findByText("Order item not found")).toBeInTheDocument();
  });
});
