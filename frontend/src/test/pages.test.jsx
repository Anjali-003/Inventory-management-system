/*
  Every page of the app opens without crashing: each one from the route table (app/routes.jsx), as the Super Admin
  (who can open them all), and the dashboard as every role (each role has its own). Data comes from the fake API:
  empty lists, zero figures. A crash fails the test with the page's name and the error.
*/
import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { PAGES } from "@/app/routes";
import { renderApp } from "./renderApp";

const ROLES = [
  "SUPER_ADMIN", "MARKETING_MANAGER", "OPERATIONS_ADMIN", "PURCHASE_MANAGER", "IQC_MANAGER",
  "STORE_MANAGER", "PRODUCTION_MANAGER", "QUALITY_FG_MANAGER", "HR_MANAGER",
];

/* rendered, the lazy page loaded, and its data in: the "loading page" fallback is gone and nothing crashed */
async function opens(Page, options) {
  const view = renderApp(<Page />, options);
  await waitFor(() => expect(screen.queryByText("loading page")).not.toBeInTheDocument(), { timeout: 15_000 });
  await new Promise((r) => setTimeout(r, 50)); // let the first answers of the fake API land
  return view;
}

describe("every page opens", () => {
  for (const { path, Page, title } of PAGES) {
    it(`${title} (${path})`, async () => {
      const view = await opens(Page, { route: path });
      expect(view.crash(), String(view.crash()?.stack || "")).toBeNull();
      expect(view.container.textContent.length).toBeGreaterThan(0);
    });
  }
});

describe("the dashboard opens for every role", () => {
  const Dashboard = PAGES.find((p) => p.path === "/dashboard").Page;
  for (const role of ROLES) {
    it(role, async () => {
      const view = await opens(Dashboard, { role, route: "/dashboard" });
      expect(view.crash(), String(view.crash()?.stack || "")).toBeNull();
    });
  }
});
