import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ShieldCheck,
  Warehouse,
  ClipboardCheck,
  ShoppingCart,
  ArrowRight,
  Boxes,
  Factory,
  PackageCheck,
  Truck,
  Users,
  Activity,
  History,
} from "lucide-react";

import { LOGIN_PORTALS, setActiveRole } from "@/lib/permissions";
import { authService } from "@/features/auth/authService";

/* One entry per login portal. Paths come from LOGIN_PORTALS, so a new role added there only needs a line here. */
const PORTAL_CARDS = [
  {
    portal: LOGIN_PORTALS.SUPER_ADMIN,
    label: "Super Admin",
    note: "Every module, users and reports",
    icon: ShieldCheck,
  },
  {
    portal: LOGIN_PORTALS.STORE_MANAGER,
    label: "Store Manager",
    note: "Stock in and out, incoming stock, finished goods",
    icon: Warehouse,
  },
  {
    portal: LOGIN_PORTALS.IQC_MANAGER,
    label: "IQC Manager",
    note: "Inspect incoming components",
    icon: ClipboardCheck,
  },
  {
    portal: LOGIN_PORTALS.PURCHASE_MANAGER,
    label: "Purchase Manager",
    note: "Raise and track purchases",
    icon: ShoppingCart,
  },
  {
    portal: LOGIN_PORTALS.PRODUCTION_MANAGER,
    label: "Production",
    note: "Update production runs and view inventory",
    icon: Factory,
  },
];

// Keep the landing page renderable if a local permissions.js is out of sync.
// The matching LOGIN_PORTALS entry is still required for that role's login route.
const AVAILABLE_PORTAL_CARDS = PORTAL_CARDS.filter(({ portal }) => portal?.role && portal?.path);

const MODULES = [
  { icon: Boxes, name: "Products and BOM", text: "Import a bill of materials from a sheet and keep every revision in one place." },
  { icon: Warehouse, name: "Inventory", text: "Stock in, stock out and a full ledger for every component." },
  { icon: Factory, name: "Orders and production", text: "Check materials before you start an order, then track it on the floor." },
  { icon: ClipboardCheck, name: "IQC and quality control", text: "Inspect incoming parts and test finished boards before they ship." },
  { icon: ShoppingCart, name: "Purchase", text: "Shortfalls turn into purchase lists with the right quantities." },
  { icon: Users, name: "Employees and attendance", text: "Daily sheets and monthly reports for the whole team." },
  { icon: History, name: "Inventory history", text: "See who moved what, when and why." },
  { icon: Activity, name: "Activity feed", text: "Every action across the plant, updated live." },
];

const FLOW = [
  { icon: ShoppingCart, name: "Purchase", text: "Raise a purchase for the shortfall" },
  { icon: ClipboardCheck, name: "IQC", text: "Inspect parts on arrival" },
  { icon: Truck, name: "Incoming stock", text: "Store accepts approved parts" },
  { icon: Factory, name: "Production", text: "Start the order with parts in hand" },
  { icon: ClipboardCheck, name: "Quality control", text: "Test and sign off each batch" },
  { icon: PackageCheck, name: "Finished goods", text: "Dispatch ready stock" },
];

const ACCESS_ROWS = [
  { role: "Super Admin", edit: "All modules", view: "None" },
  { role: "Store Manager", edit: "Inventory, inventory history, finished goods, incoming stock", view: "IQC, purchase" },
  { role: "IQC Manager", edit: "IQC", view: "None" },
  { role: "Purchase Manager", edit: "Purchase", view: "None" },
  { role: "Production", edit: "Production", view: "Dashboard, Inventory" },
];

/* ---------- shared Tailwind class sets ---------- */
const wrap = "mx-auto w-full max-w-[1160px] px-4 sm:px-6";
const heading = "font-lp-head tracking-[-0.02em] text-lp-ink";
const focusRing = "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-cf-blue";

const btnBase = `inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-transparent font-semibold no-underline transition-colors ${focusRing}`;
const btnMd = "px-5 py-3 text-[0.95rem]";
const btnSm = "px-4 py-2 text-[0.9rem]";
const btnSolid = "bg-lp-green text-white hover:bg-lp-green-dark";
const btnLight = "border-white/30 bg-white/10 text-white hover:bg-white hover:text-lp-deep";

/* the line that joins one process step to the next (desktop only, not after the last step) */
const flowConnector =
  "lg:before:absolute lg:before:top-[21px] lg:before:right-2 lg:before:left-11 lg:before:h-0.5 lg:before:bg-lp-line lg:before:content-['']";

/* the tick drawn in front of each hero proof point */
const tick =
  "before:absolute before:top-[0.45em] before:left-0 before:h-2 before:w-3.5 before:-translate-y-[30%] before:-rotate-45 before:border-b-[2.5px] before:border-l-[2.5px] before:border-lp-green before:content-['']";

export default function Landing() {
  // roles that are already logged in on this browser: { STORE_MANAGER: { name, ... }, ... }
  const [sessions, setSessions] = useState({});

  useEffect(() => {
    let alive = true;
    authService
      .sessions()
      .then((list) => alive && setSessions(Object.fromEntries(list.map((x) => [x.role, x]))))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const signedInCount = Object.keys(sessions).length;

  return (
    <div className="min-h-screen bg-lp-bg text-base leading-[1.6] text-lp-text">
      {/* top bar */}
      <header className="sticky top-0 z-20 border-b border-lp-line bg-lp-bg/90 backdrop-blur-sm">
        <div className={`${wrap} flex h-16 items-center justify-between gap-8`}>
          <Link
            to="/"
            className={`inline-flex items-center gap-2.5 font-lp-head text-[1.1rem] font-bold text-lp-ink no-underline ${focusRing}`}
            aria-label="Sensation Systems home"
          >
            <img src="/ss_logo.png" alt="" width="30" height="30" />
            <span>Sensation Systems</span>
          </Link>

          <nav className="ml-auto hidden gap-6 lg:flex" aria-label="Page sections">
            {[
              ["#how", "How it works"],
              ["#modules", "Modules"],
              ["#access", "Roles"],
            ].map(([href, text]) => (
              <a
                key={href}
                href={href}
                className={`text-[0.95rem] font-medium text-lp-text no-underline hover:text-lp-green ${focusRing}`}
              >
                {text}
              </a>
            ))}
          </nav>

          <a href="#login" className={`${btnBase} ${btnSolid} ${btnSm}`}>
            {signedInCount > 0 ? "Open workspace" : "Log in"}
          </a>
        </div>
      </header>

      {/* hero with every login button */}
      <section className="pt-12 pb-10 lg:pt-18 lg:pb-14">
        <div className={`${wrap} grid items-center gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-16`}>
          <div>
            <h1 className={`${heading} max-w-[15em] text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[1.06] font-bold`}>
              Know every missing component before the line stops.
            </h1>
            <p className="mt-5 max-w-[34em] text-[1.15rem] text-lp-text">
              EPIMS keeps production, inventory, quality and purchasing in one system, so a shortfall shows up
              on the material check, not on the shop floor.
            </p>

            <ul className="mt-7 hidden gap-2.5 lg:grid">
              {[
                "BOM based material check before every order",
                "Separate workspace and permissions for each role",
                "Live updates across stores, IQC and purchase",
              ].map((item) => (
                <li key={item} className={`relative pl-[26px] font-medium text-lp-ink ${tick}`}>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <aside
            id="login"
            aria-labelledby="lp-login-title"
            className="scroll-mt-[90px] rounded-[14px] border border-lp-line bg-white p-5 shadow-[0_1px_2px_rgba(16,33,28,0.05),0_18px_40px_rgba(16,33,28,0.08)] sm:p-7"
          >
            <h2 id="lp-login-title" className={`${heading} text-[1.4rem]`}>
              Log in to your workspace
            </h2>
            <p className="mt-1 text-[0.95rem] text-lp-muted">
              Choose the role you work in. Different roles can stay logged in at once, one per browser tab.
            </p>

            <div className="mt-5 grid gap-2.5">
              {AVAILABLE_PORTAL_CARDS.map(({ portal, label, note, icon: Icon }) => {
                const session = sessions[portal.role];
                return (
                  <Link
                    key={portal.role}
                    to={session ? "/dashboard" : portal.path}
                    onClick={session ? () => setActiveRole(portal.role) : undefined}
                    className={`group flex items-center gap-3.5 rounded-[10px] border px-4 py-3.5 text-lp-ink no-underline transition-colors hover:border-lp-green hover:bg-lp-soft ${focusRing} ${
                      session ? "border-lp-portal-on bg-lp-soft" : "border-lp-line bg-white"
                    }`}
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-[9px] bg-lp-tint text-lp-green">
                      <Icon size={20} />
                    </span>
                    <span className="grid min-w-0 flex-1 gap-px">
                      <strong className="text-base">{label}</strong>
                      <small className="text-[0.85rem] leading-[1.35] text-lp-muted">
                        {session ? `Logged in as ${session.name}. Continue in this tab` : note}
                      </small>
                    </span>
                    {session && (
                      <span className="shrink-0 rounded-full bg-lp-green px-2.5 py-0.5 text-[0.78rem] font-semibold text-white">
                        Logged in
                      </span>
                    )}
                    <ArrowRight
                      size={18}
                      className="shrink-0 text-lp-muted transition group-hover:translate-x-[3px] group-hover:text-lp-green motion-reduce:transition-none"
                    />
                  </Link>
                );
              })}
            </div>
          </aside>
        </div>
      </section>

      {/* process */}
      <section id="how" className="py-16 lg:py-22">
        <div className={wrap}>
          <div className="mb-10 max-w-[40em]">
            <h2 className={`${heading} text-[clamp(1.7rem,3vw,2.3rem)] leading-[1.15] font-bold`}>
              From purchase to dispatch, nothing gets lost in between
            </h2>
            <p className="mt-2.5 text-[1.05rem] text-lp-muted">
              Each step belongs to one role, and each hand-off is recorded.
            </p>
          </div>

          <ol className="m-0 grid list-none grid-cols-1 gap-y-7 p-0 sm:grid-cols-2 lg:grid-cols-6 lg:gap-y-0">
            {FLOW.map(({ icon: Icon, name, text }, i) => (
              <li
                key={name + i}
                className={`relative grid content-start gap-1 pr-4 ${i < FLOW.length - 1 ? flowConnector : ""}`}
              >
                <span className="relative z-10 mb-2.5 grid size-[42px] place-items-center rounded-full bg-lp-green text-white">
                  <Icon size={20} />
                </span>
                <strong className="font-lp-head text-[1.05rem] text-lp-ink">{name}</strong>
                <span className="text-[0.92rem] leading-[1.45] text-lp-muted">{text}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* modules */}
      <section id="modules" className="bg-lp-tint py-16 lg:py-22">
        <div className={wrap}>
          <div className="mb-10 max-w-[40em]">
            <h2 className={`${heading} text-[clamp(1.7rem,3vw,2.3rem)] leading-[1.15] font-bold`}>
              Everything a component-driven factory runs on
            </h2>
          </div>

          <div className="grid gap-x-14 lg:grid-cols-2">
            {MODULES.map(({ icon: Icon, name, text }) => (
              <div key={name} className="flex gap-4 border-t border-lp-rule py-5 text-lp-green">
                <Icon size={22} className="mt-[3px] shrink-0" />
                <div>
                  <h3 className={`${heading} text-[1.1rem] font-semibold`}>{name}</h3>
                  <p className="mt-0.5 text-[0.97rem] text-lp-text">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* roles */}
      <section id="access" className="py-16 lg:py-22">
        <div className={wrap}>
          <div className="mb-10 max-w-[40em]">
            <h2 className={`${heading} text-[clamp(1.7rem,3vw,2.3rem)] leading-[1.15] font-bold`}>
              Each role sees only what it needs
            </h2>
            <p className="mt-2.5 text-[1.05rem] text-lp-muted">
              Access is enforced on the server as well as in the screens.
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-lp-line bg-white">
            <table className="w-full min-w-[620px] border-collapse text-[0.97rem]">
              <thead>
                <tr className="border-b border-lp-line">
                  {["Role", "Can edit", "Can only view"].map((h) => (
                    <th key={h} className="bg-cf-head px-5 py-4 text-left align-top text-[0.9rem] font-semibold text-lp-muted">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ACCESS_ROWS.map((r) => (
                  <tr key={r.role} className="border-b border-lp-line last:border-b-0">
                    <th scope="row" className="px-5 py-4 text-left align-top font-semibold whitespace-nowrap text-lp-ink">
                      {r.role}
                    </th>
                    <td className="px-5 py-4 text-left align-top">{r.edit}</td>
                    <td className="px-5 py-4 text-left align-top">{r.view}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* closing login strip */}
      <section className="bg-lp-deep py-16">
        <div className={`${wrap} flex flex-wrap items-center justify-between gap-8`}>
          <h2 className={`${heading} text-[clamp(1.5rem,2.6vw,2rem)] text-white`}>Ready to get back to work?</h2>
          <div className="flex flex-wrap gap-3 max-sm:w-full">
            {AVAILABLE_PORTAL_CARDS.map(({ portal, label }) => {
              const session = sessions[portal.role];
              return (
                <Link
                  key={portal.role}
                  to={session ? "/dashboard" : portal.path}
                  onClick={session ? () => setActiveRole(portal.role) : undefined}
                  className={`${btnBase} ${btnLight} ${btnMd} max-sm:w-full`}
                >
                  {session ? `Continue as ${label}` : `${label} login`}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="border-t border-lp-line py-6 text-[0.9rem] text-lp-muted">
        <div className={`${wrap} flex flex-wrap justify-between gap-x-6 gap-y-2`}>
          <span>&copy; {new Date().getFullYear()} Sensation Systems</span>
          <span>EPIMS: Electronics Production and Inventory Management System</span>
        </div>
      </footer>
    </div>
  );
}
