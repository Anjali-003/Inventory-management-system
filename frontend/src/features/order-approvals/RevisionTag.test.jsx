/*
  The line under a revised order's status (Operations Admin's list): it says whose turn it is. After Marketing agrees
  the order is Pending again and waits for the admin's Approve, so "accepted" alone would read as "done".
*/
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RevisionTag } from "./opsKit";

const order = (status, revision = {}, accepted = null) => ({
  approval_status: status,
  items: [{ product_id: 1, name: "Controller", quantity: 800 }],
  revision: { remarks: "Line busy", items: [], ...revision },
  revision_accepted_at: accepted,
});

describe("RevisionTag", () => {
  it("waiting for Marketing", () => {
    render(<RevisionTag order={order("QUANTITY_REVISED")} />);
    expect(screen.getByText("Qty reduced, waiting for Marketing")).toBeInTheDocument();
  });

  it("Marketing agreed, back with the admin: says it is the admin's turn to approve", () => {
    render(<RevisionTag order={order("PENDING_APPROVAL", {}, "2026-10-28 12:00:00")} />);
    expect(screen.getByText("Marketing agreed to 800 · your turn to approve")).toBeInTheDocument();
  });

  it("Marketing agreed and the admin approved", () => {
    render(<RevisionTag order={order("APPROVED", {}, "2026-10-28 12:00:00")} />);
    expect(screen.getByText("Marketing agreed to 800")).toBeInTheDocument();
  });

  it("Marketing did not agree", () => {
    render(<RevisionTag order={order("CANCELLED", { declined_at: "2026-10-28 12:00:00" })} />);
    expect(screen.getByText("Marketing did not agree to the reduced qty")).toBeInTheDocument();
  });

  it("an order that was never revised shows nothing", () => {
    const { container } = render(<RevisionTag order={{ ...order("PENDING_APPROVAL"), revision: null }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
