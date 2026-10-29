/*
  New order popup: it opens (it once crashed on open), refuses an order without a customer, the customer's date or a product,
  and sends a saved customer by id with the customer's date and whole-number quantities. "Order again" starts filled in.
*/
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderApp } from "@/test/renderApp";
import { requests, respond } from "@/test/fakeApi";
import NewOrderModal from "./NewOrderModal";

function open(from = null) {
  respond("GET", "/marketing-orders/products", [{ id: 1, sku: "P-CTRL", name: "Controller", selling_price: "250.00" }]);
  respond("GET", "/marketing-orders/customers", [{ id: 5, name: "Sharma Traders" }]);
  respond("POST", "/marketing-orders", { id: 9, order_number: "ORD-009" });
  const onClose = vi.fn();
  const view = renderApp(<NewOrderModal from={from} onClose={onClose} />, { role: "MARKETING_MANAGER" });
  return { ...view, onClose };
}

describe("New order popup", () => {
  it("opens", async () => {
    const view = open();
    expect(await screen.findByText("New order")).toBeInTheDocument();
    expect(view.crash()).toBeNull();
  });

  it("asks for a customer, the customer's date and a product before saving", async () => {
    open();
    fireEvent.click(await screen.findByRole("button", { name: /save as draft/i }));
    expect(await screen.findByText("Enter the customer this order is for")).toBeInTheDocument();
    expect(screen.getByText("Ask the customer when they need it")).toBeInTheDocument();
    expect(screen.getByText("Select a product", { selector: "p" })).toBeInTheDocument();
    expect(requests.some((r) => r.method === "POST")).toBe(false);
  });

  it("saves a saved customer by id, with the product and its quantity", async () => {
    const { onClose } = open();
    fireEvent.change(await screen.findByLabelText("Customer"), { target: { value: "sharma traders" } });
    fireEvent.change(screen.getByLabelText("Customer wants it by"), { target: { value: "2099-12-31" } });
    const product = await screen.findByLabelText("Product");
    await waitFor(() => expect(product.querySelectorAll("option").length).toBeGreaterThan(1)); // the list has loaded
    fireEvent.change(product, { target: { value: "1" } });
    expect(await screen.findByText(/250 per piece/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /save as draft/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const sent = requests.find((r) => r.method === "POST" && r.url === "/marketing-orders");
    expect(sent.data).toMatchObject({ customer_id: 5, required_by_date: "2099-12-31", items: [{ productId: 1, quantity: 1 }] });
  });

  it("Order again starts with the earlier order's customer and products, and asks the date again", async () => {
    const { onClose } = open({ id: 3, order_number: "ORD-003", customer_name: "Sharma Traders", items: [{ product_id: 1, name: "Controller", quantity: 40 }] });
    expect(await screen.findByText("Order again: ORD-003")).toBeInTheDocument();
    expect(screen.getByLabelText("Customer")).toHaveValue("Sharma Traders");
    expect(screen.getByLabelText("Customer wants it by")).toHaveValue("");
    await screen.findByText(/250 per piece/); // the product list has loaded
    fireEvent.change(screen.getByLabelText("Customer wants it by"), { target: { value: "2099-12-31" } });
    fireEvent.click(screen.getByRole("button", { name: /save as draft/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const sent = requests.find((r) => r.method === "POST" && r.url === "/marketing-orders");
    expect(sent.data).toMatchObject({ customer_id: 5, items: [{ productId: 1, quantity: 40 }] });
  });

  it("starts the agreed rate at the price list, and asks why when it is lower", async () => {
    const { onClose } = open();
    fireEvent.change(await screen.findByLabelText("Customer"), { target: { value: "Sharma Traders" } });
    fireEvent.change(screen.getByLabelText("Customer wants it by"), { target: { value: "2099-12-31" } });
    const product = await screen.findByLabelText("Product");
    await waitFor(() => expect(product.querySelectorAll("option").length).toBeGreaterThan(1));
    fireEvent.change(product, { target: { value: "1" } });

    const rate = await screen.findByLabelText("Agreed rate (₹ per piece)");
    expect(rate).toHaveValue("250"); // the price list
    fireEvent.change(rate, { target: { value: "200" } });
    expect(screen.getByText("20% below the price list")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /save as draft/i }));
    expect(await screen.findByText("Write why the rate is below the price list")).toBeInTheDocument();
    expect(requests.some((r) => r.method === "POST")).toBe(false);

    fireEvent.change(screen.getByLabelText("Why below the price list?"), { target: { value: "Bulk order" } });
    fireEvent.click(screen.getByRole("button", { name: /save as draft/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const sent = requests.find((r) => r.method === "POST" && r.url === "/marketing-orders");
    expect(sent.data.items).toEqual([{ productId: 1, quantity: 1, rate: 200, rate_note: "Bulk order" }]);
  });
});
