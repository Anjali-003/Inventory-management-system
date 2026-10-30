/* Monthly attendance report: GET /attendance/summary?month= through RTK Query, one row per employee. */
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderApp } from "@/test/renderApp";
import { fail, respond } from "@/test/fakeApi";
import { MonthlyReport } from "./MonthlyReport";

describe("Monthly attendance report", () => {
  it("lists every employee of the month", async () => {
    respond("GET", "/attendance/summary", [
      { employee_id: 1, employee_code: "E-01", name: "Asha Verma", department: "Store", present: 20, half_day: 1, absent: 1, on_leave: 0 },
    ]);
    renderApp(<MonthlyReport />, { role: "HR_MANAGER" });
    expect(await screen.findAllByText("Asha Verma")).not.toHaveLength(0);
  });

  it("offers a retry when the report fails", async () => {
    fail("GET", "/attendance/summary", 500, "Server error");
    renderApp(<MonthlyReport />, { role: "HR_MANAGER" });
    expect(await screen.findByText("Could not load the monthly report.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
