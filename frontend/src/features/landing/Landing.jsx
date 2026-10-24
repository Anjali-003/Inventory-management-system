import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, MotionConfig, motion, useInView, useScroll, useTransform } from "motion/react";
import {
  ShieldCheck,
  Warehouse,
  ClipboardCheck,
  ShoppingCart,
  ArrowRight,
  ArrowUp,
  Boxes,
  Factory,
  PackageCheck,
  Truck,
  Users,
  Activity,
  History,
  UserCog,
  Plus,
  Receipt,
  ArrowLeft,
  ArrowDown,
  RotateCcw,
  Stamp,
  CircleCheck,
  TriangleAlert,
} from "lucide-react";

import { LOGIN_PORTALS, setActiveRole } from "@/lib/permissions";
import { authService } from "@/features/auth/authService";

/* One entry per login portal. Paths come from LOGIN_PORTALS, so a new role added there only needs a line here. */
const PORTAL_CARDS = [
  { portal: LOGIN_PORTALS.SUPER_ADMIN, label: "Super Admin", note: "Every module, users and reports", icon: ShieldCheck },
  { portal: LOGIN_PORTALS.MARKETING_MANAGER, label: "Marketing Manager", note: "Prepare orders and send them for approval", icon: Activity },
  { portal: LOGIN_PORTALS.OPERATIONS_ADMIN, label: "Operations Admin", note: "Approve or reject incoming orders", icon: Stamp },
  { portal: LOGIN_PORTALS.STORE_MANAGER, label: "Store Manager", note: "Stock in and out, incoming stock, finished goods", icon: Warehouse },
  { portal: LOGIN_PORTALS.IQC_MANAGER, label: "IQC Manager", note: "Inspect incoming components", icon: ClipboardCheck },
  { portal: LOGIN_PORTALS.PURCHASE_MANAGER, label: "Purchase Manager", note: "Raise and track purchases", icon: ShoppingCart },
  { portal: LOGIN_PORTALS.PRODUCTION_MANAGER, label: "Production", note: "Update production runs and view inventory", icon: Factory },
  {
    portal: LOGIN_PORTALS.QUALITY_FG_MANAGER,
    label: "Quality Control & Finished Goods",
    note: "Record pass or fail decisions, manage rework, release finished goods",
    icon: PackageCheck,
  },
  { portal: LOGIN_PORTALS.HR_MANAGER, label: "HR Manager", note: "Manage employee records and daily attendance", icon: UserCog },
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

const ACCESS_ROWS = [
  { role: "Super Admin", edit: "All modules", view: "None" },
  { role: "Marketing Manager", edit: "Marketing orders", view: "Dashboard" },
  { role: "Operations Admin", edit: "Order approvals", view: "Dashboard, approved orders, inventory, inventory history, finished goods, incoming stock, IQC, purchase" },
  { role: "Store Manager", edit: "Inventory, inventory history, finished goods, incoming stock", view: "Dashboard, IQC, purchase" },
  { role: "IQC Manager", edit: "IQC", view: "Dashboard, purchase, inventory, inventory history, finished goods, incoming stock" },
  { role: "Purchase Manager", edit: "Purchase", view: "Dashboard, approved orders, IQC, inventory, inventory history, finished goods, incoming stock" },
  { role: "Production Manager", edit: "Production", view: "Dashboard, inventory" },
  { role: "Quality Control & Finished Goods", edit: "Quality Control, finished goods", view: "Dashboard, production" },
  { role: "HR Manager", edit: "Employees, attendance", view: "Dashboard" },
];

const FAQ = [
  {
    q: "How do I get an account?",
    a: "Accounts are created by your system administrator, one per person and role. Ask them for your login email and a first password.",
  },
  {
    q: "Can I work in two roles at the same time?",
    a: "Yes. Every role has its own login, so you can open one browser tab per role and stay logged in to all of them at once.",
  },
  {
    q: "Why can I see a page but not change anything on it?",
    a: "Some pages are shared for reference. Your role can view them, but only the department that owns the page can make changes there.",
  },
  {
    q: "Do I need to refresh to see what other departments did?",
    a: "No. Lists and dashboards update live, and you get a notification in the bell at the top whenever something needs your attention.",
  },
  {
    q: "What happens when a component is short for an order?",
    a: "The material check shows the exact shortfall per component. The Operations Admin sends that list to the Purchase Manager when the order is approved.",
  },
  {
    q: "Is every stock movement recorded?",
    a: "Yes. Every stock in, stock out and hand over is written to the ledger with who did it and when, so the history page always adds up.",
  },
];

const NAV = [
  ["login", "Workflow"],
  ["modules", "Modules"],
  ["access", "Roles"],
  ["faq", "FAQ"],
];

/* ---------- motion + shared class sets ---------- */
const EASE = [0.32, 0.72, 0, 1];
const wrap = "mx-auto w-full max-w-6xl px-4 sm:px-6";
const heading = "font-lp-head tracking-tight text-lp-ink text-balance";
const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-lp-green focus-visible:ring-offset-2 focus-visible:ring-offset-lp-bg";
const ease = "transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]";
const btnPrimary = `inline-flex items-center justify-center gap-2 rounded-lg bg-lp-green px-3 py-2 text-base font-semibold text-white ${ease} hover:bg-lp-green-dark hover:-translate-y-0.5 active:translate-y-px active:scale-[0.98] ${focusRing}`;

const MOTION_TAGS = { div: motion.div, li: motion.li };

/* Fades up out of a soft blur as it scrolls into view. */
function Reveal({ children, delay = 0, className, as = "div" }) {
  const M = MOTION_TAGS[as];
  return (
    <M
      className={className}
      initial={{ opacity: 0, y: 64, filter: "blur(12px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.9, ease: EASE, delay }}
    >
      {children}
    </M>
  );
}

function SectionHead({ eyebrow, title, text }) {
  return (
    <Reveal className="mb-12 max-w-2xl">
      <p className="text-sm font-semibold text-lp-green">{eyebrow}</p>
      <h2 className={`${heading} mt-2 text-3xl font-bold sm:text-4xl`}>{title}</h2>
      {text && <p className="mt-3 text-lg text-pretty text-lp-muted">{text}</p>}
    </Reveal>
  );
}

/* where a portal card leads: straight to the dashboard when that role is already logged in on this browser */
function portalLink(portal, session) {
  return { to: session ? "/dashboard" : portal.path, onClick: session ? () => setActiveRole(portal.role) : undefined };
}

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
  const loginLabel = signedInCount > 0 ? "Open your workspace" : "Log in to your workspace";

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-lp-bg font-lp-head text-base text-lp-text antialiased">
        <a href="#main" className="sr-only z-50 rounded-lg bg-lp-green px-3 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:top-4 focus:left-4">
          Skip to content
        </a>

        <IslandNav signedIn={signedInCount > 0} />

        <main id="main">
          <Hero loginLabel={loginLabel} />
          <Workflow sessions={sessions} />
          <TaglineReveal />
          <Modules />
          <Access />
          <Faq />
          <FinalCta loginLabel={loginLabel} />
        </main>

        <footer className="border-t border-lp-line py-8 text-sm text-lp-muted">
          <div className={`${wrap} flex flex-wrap items-center justify-between gap-4`}>
            <span className="inline-flex items-center gap-2">
              <img src="/ss_logo.png" alt="" width="20" height="20" className="rounded" />
              &copy; {new Date().getFullYear()} Sensation Systems · EPIMS, Electronics Production and Inventory Management System
            </span>
            <a href="#main" className={`inline-flex items-center gap-1 rounded font-medium hover:text-lp-green ${focusRing}`}>
              Back to top <ArrowUp className="size-4" />
            </a>
          </div>
        </footer>
      </div>
    </MotionConfig>
  );
}

/* ------------------------------------------------------------------ nav */

/* Floating glass pill. On phones the hamburger morphs into an X and opens a full screen glass menu. */
function IslandNav({ signedIn }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(null);

  // highlight the section that is in the middle of the screen
  useEffect(() => {
    const els = NAV.map(([id]) => document.getElementById(id)).filter(Boolean);
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: "-45% 0px -50% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 px-4">
        <nav
          aria-label="Main"
          className="mx-auto mt-6 flex w-max max-w-full items-center gap-2 rounded-full border border-lp-line bg-white/75 py-2 pr-2 pl-4 shadow-[0_8px_32px_-12px_rgba(16,33,28,0.18)] backdrop-blur-xl"
        >
          <Link to="/" aria-label="Sensation Systems home" className={`mr-2 inline-flex items-center gap-2 rounded-full text-sm font-bold text-lp-ink ${focusRing}`}>
            <img src="/ss_logo.png" alt="" width="24" height="24" className="rounded-md" />
            <span>Sensation Systems</span>
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            {NAV.map(([id, text]) => (
              <a
                key={id}
                href={`#${id}`}
                aria-current={active === id ? "true" : undefined}
                className={`relative rounded-full px-3 py-2 text-sm font-medium ${ease} ${focusRing} ${
                  active === id ? "text-lp-ink" : "text-lp-muted hover:text-lp-ink"
                }`}
              >
                {active === id && (
                  <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-lp-tint" transition={{ duration: 0.6, ease: EASE }} />
                )}
                <span className="relative">{text}</span>
              </a>
            ))}
          </div>

          <a href="#login" className={`hidden rounded-full bg-lp-green px-4 py-2 text-sm font-semibold text-white md:inline-flex ${ease} hover:bg-lp-green-dark active:scale-[0.98] ${focusRing}`}>
            {signedIn ? "Open workspace" : "Log in"}
          </a>

          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className={`relative z-50 grid size-10 place-items-center rounded-full md:hidden ${ease} hover:bg-lp-tint ${focusRing}`}
          >
            <span className={`absolute h-0.5 w-5 rounded-full bg-lp-ink ${ease} ${open ? "rotate-45" : "-translate-y-1"}`} />
            <span className={`absolute h-0.5 w-5 rounded-full bg-lp-ink ${ease} ${open ? "-rotate-45" : "translate-y-1"}`} />
          </button>
        </nav>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div
            key="menu"
            className="fixed inset-0 z-30 flex flex-col justify-center bg-white/80 px-8 backdrop-blur-3xl md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            <ul className="grid gap-6">
              {[...NAV, ["login", signedIn ? "Open workspace" : "Log in"]].map(([id, text], i) => (
                <li key={`${id}-${i}`} className="overflow-hidden">
                  <motion.a
                    href={`#${id}`}
                    onClick={() => setOpen(false)}
                    className={`block rounded text-4xl font-semibold text-lp-ink ${focusRing}`}
                    initial={{ y: 48, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.7, ease: EASE, delay: 0.1 + i * 0.05 }}
                  >
                    {text}
                  </motion.a>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ------------------------------------------------------------------ hero */

function Hero({ loginLabel }) {
  const stats = [
    ["9", "role workspaces"],
    ["8", "steps from order to billing"],
    ["Live", "updates in every tab"],
  ];
  return (
    <section className="pt-40 pb-20 lg:pt-48 lg:pb-24">
      <div className={`${wrap} grid items-center gap-16 lg:grid-cols-2`}>
        <div>
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-lp-line bg-white px-3 py-1 text-sm font-medium text-lp-text">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-lp-green opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex size-2 rounded-full bg-lp-green" />
              </span>
              Electronics production and inventory, in one place
            </span>
          </Reveal>
          <Reveal delay={0.08}>
            <h1 className="mt-6 max-w-[680px] bg-linear-to-r from-black to-[#666666] bg-clip-text pb-1 font-lp-head text-4xl font-bold tracking-tight text-balance text-transparent sm:text-5xl">
              Know every missing component before the line stops.
            </h1>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-6 max-w-[680px] text-lg text-pretty text-lp-text">
              EPIMS keeps production, inventory, quality and purchasing in one system, so a shortfall shows up on the
              material check, not on the shop floor.
            </p>
          </Reveal>
          <Reveal delay={0.24} className="mt-8 flex flex-wrap items-center gap-4">
            <a href="#login" className={btnPrimary}>
              {loginLabel} <ArrowRight className="size-4" />
            </a>
          </Reveal>
          <Reveal delay={0.32}>
            <dl className="mt-12 grid max-w-md grid-cols-3 gap-6">
              {stats.map(([value, label]) => (
                <div key={label}>
                  <dt className="sr-only">{label}</dt>
                  <dd className="text-2xl font-bold text-lp-ink tabular-nums">{value}</dd>
                  <dd className="text-sm text-lp-muted">{label}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>

        <Reveal delay={0.2}>
          <MaterialCheckPreview />
        </Reveal>
      </div>
    </section>
  );
}

const PREVIEW_ROWS = [
  { name: "470E resistor", size: "1206", need: 240, have: 5000 },
  { name: "TL431 regulator", size: "SMT", need: 360, have: 5000 },
  { name: "MBRF20200CT diode", size: "TH", need: 120, have: 84 },
  { name: "1000UF/35V capacitor", size: "TH", need: 120, have: 5000 },
];

/* A small, animated picture of the product: the material check of an order, with a live update arriving. */
function MaterialCheckPreview() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });

  return (
    <div ref={ref} className="relative sm:pb-12">
      <div className="rounded-2xl border border-lp-line bg-white p-2 shadow-[0_1px_2px_rgba(16,33,28,0.05),0_32px_64px_-24px_rgba(16,33,28,0.24)]">
        <div className="rounded-xl border border-lp-line bg-lp-bg">
          <div className="flex items-center justify-between gap-4 border-b border-lp-line px-4 py-3">
            <div>
              <p className="text-xs font-medium text-lp-muted">Material check</p>
              <p className="text-sm font-semibold text-lp-ink">Order 018 · UTS SS E2950A × 120</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-lp-tint px-2 py-1 text-xs font-semibold text-lp-green">
              <span className="size-1.5 rounded-full bg-lp-green" /> Live
            </span>
          </div>

          <ul className="grid gap-3 p-4">
            {PREVIEW_ROWS.map((r, i) => {
              const short = r.have < r.need;
              const pct = Math.min(100, Math.round((r.have / r.need) * 100));
              return (
                <li key={r.name} className="rounded-lg border border-lp-line bg-white p-3">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-medium text-lp-ink">
                      {r.name} <span className="text-lp-muted">{r.size}</span>
                    </span>
                    {short ? (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-warning">
                        <TriangleAlert className="size-3.5" /> {r.need - r.have} short
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-lp-green">
                        <CircleCheck className="size-3.5" /> Ready
                      </span>
                    )}
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-lp-tint">
                    <motion.div
                      className={`h-full rounded-full ${short ? "bg-warning" : "bg-lp-green"}`}
                      initial={{ width: 0 }}
                      animate={inView ? { width: `${pct}%` } : undefined}
                      transition={{ duration: 1.2, ease: EASE, delay: 0.3 + i * 0.12 }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-lp-muted tabular-nums">
                    Need {r.need} · On hand {r.have.toLocaleString("en-IN")}
                  </p>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center justify-between gap-3 border-t border-lp-line px-4 py-3">
            <p className="text-sm text-lp-text">
              <span className="font-semibold text-lp-ink">1 component short.</span> Purchase list ready.
            </p>
            <span className="inline-flex items-center gap-1 rounded-md bg-lp-green px-2 py-1 text-xs font-semibold text-white">
              <Plus className="size-3.5" /> Send to purchase
            </span>
          </div>
        </div>
      </div>

      {/* a live update sliding in, like the bell notifications inside the app */}
      <motion.div
        aria-hidden
        className="absolute bottom-0 -left-6 hidden w-80 items-start gap-3 rounded-xl border border-lp-line bg-white p-3 shadow-[0_16px_40px_-12px_rgba(16,33,28,0.28)] sm:flex"
        initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
        animate={inView ? { opacity: 1, y: 0, filter: "blur(0px)" } : undefined}
        transition={{ duration: 0.9, ease: EASE, delay: 1.4 }}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-lp-tint text-lp-green">
          <Truck className="size-4" />
        </span>
        <span className="min-w-0 text-sm">
          <span className="block font-semibold text-lp-ink">Purchase PO 0041 passed IQC</span>
          <span className="block text-xs text-lp-muted">84 pcs ready to accept into stock · <span className="whitespace-nowrap">just now</span></span>
        </span>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ workflow + logins */

/*
  The real order of work, one card per hand over. Each card is also the login of the role doing that step.
  Desktop: two rows of four that snake round (1 to 4 left to right, 5 to 8 right to left), so step 8, billing back at
  marketing, sits under step 1 where the next order starts. Phones: one timeline from top to bottom.
*/
const WORKFLOW = [
  { role: "MARKETING_MANAGER", action: "Brings the order", text: "Creates the customer order and sends it to the Operations Admin." },
  { role: "OPERATIONS_ADMIN", action: "Approves the order", text: "Checks stock, approves, and sends what is missing to purchase." },
  { role: "PURCHASE_MANAGER", action: "Buys what is missing", text: "Raises purchases for the shortfall and sends arrivals to IQC." },
  { role: "IQC_MANAGER", action: "Inspects what arrives", text: "Approves the good parts and rejects the rest." },
  { role: "STORE_MANAGER", action: "Stores approved stock", text: "Keeps exactly what IQC approved and issues it to production." },
  { role: "PRODUCTION_MANAGER", action: "Builds the product", text: "Takes materials from the store and runs production." },
  { role: "QUALITY_FG_MANAGER", action: "Tests and packs", text: "Tests every batch, handles rework, packs finished goods." },
  { role: "MARKETING_MANAGER", action: "Bills the customer", text: "Finished goods come back to marketing for billing and dispatch.", icon: Receipt },
];
const SUPPORT_ROLES = ["SUPER_ADMIN", "HR_MANAGER"];

// desktop grid cell and the arrow towards the next step, per position in WORKFLOW
const CELL = [
  "lg:col-start-1 lg:row-start-1", "lg:col-start-2 lg:row-start-1", "lg:col-start-3 lg:row-start-1", "lg:col-start-4 lg:row-start-1",
  "lg:col-start-4 lg:row-start-2", "lg:col-start-3 lg:row-start-2", "lg:col-start-2 lg:row-start-2", "lg:col-start-1 lg:row-start-2",
];
const NEXT = ["right", "right", "right", "down", "left", "left", "left", "up"];
const ARROW = {
  right: { icon: ArrowRight, at: "-right-10 top-1/2 -translate-y-1/2" },
  left: { icon: ArrowLeft, at: "-left-10 top-1/2 -translate-y-1/2" },
  down: { icon: ArrowDown, at: "-bottom-10 left-1/2 -translate-x-1/2" },
  up: { icon: RotateCcw, at: "-top-10 left-1/2 -translate-x-1/2", label: "Next order starts again at step 1" },
};

const cardByRole = Object.fromEntries(AVAILABLE_PORTAL_CARDS.map((c) => [c.portal.role, c]));

function Workflow({ sessions }) {
  const steps = WORKFLOW.filter((s) => cardByRole[s.role]);
  const support = SUPPORT_ROLES.map((r) => cardByRole[r]).filter(Boolean);
  const snake = steps.length === WORKFLOW.length; // the snake layout only works with all eight steps

  return (
    <section id="login" className="scroll-mt-24 border-y border-lp-line bg-white py-20 lg:py-24">
      <div className={wrap}>
        <SectionHead
          eyebrow="Workflow and login"
          title="Find your step in the flow, then open your workspace"
          text="Every order moves through these hands in this order. Each card is the login for the role doing that step, and you can stay logged in to several roles at once, one per browser tab."
        />

        <ol className="grid gap-6 lg:grid-cols-4 lg:gap-12">
          {steps.map((step, i) => {
            const { portal, label, icon } = cardByRole[step.role];
            const session = sessions[portal.role];
            const Icon = step.icon || icon;
            const arrow = snake ? ARROW[NEXT[i]] : null;
            const ArrowIcon = arrow?.icon;
            const last = i === steps.length - 1;
            return (
              <Reveal as="li" key={i} delay={i * 0.07} className={`relative ${snake ? CELL[i] : ""}`}>
                <Link
                  {...portalLink(portal, session)}
                  className={`group flex h-full flex-col rounded-2xl border p-4 ${ease} hover:-translate-y-1 hover:border-lp-green hover:shadow-[0_24px_48px_-24px_rgba(15,109,85,0.35)] active:scale-[0.98] ${focusRing} ${
                    last ? "bg-lp-soft" : "bg-white"
                  } ${session ? "border-lp-portal-on" : "border-lp-line"}`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className={`grid size-10 place-items-center rounded-xl ${ease} ${session ? "bg-lp-green text-white" : "bg-lp-tint text-lp-green group-hover:bg-lp-green group-hover:text-white"}`}>
                      <Icon className="size-5" />
                    </span>
                    <span className="text-xs font-semibold text-lp-muted tabular-nums">Step {String(i + 1).padStart(2, "0")}</span>
                  </span>
                  <span className="mt-4 text-xs font-semibold text-lp-green">{label}</span>
                  <strong className="mt-1 text-base font-semibold text-lp-ink">{step.action}</strong>
                  <span className="mt-1 flex-1 text-sm text-pretty text-lp-muted">{step.text}</span>
                  <span className="mt-4 flex items-center justify-between gap-2 border-t border-lp-line pt-3 text-sm font-semibold">
                    {session ? (
                      <span className="min-w-0 truncate text-lp-green">Logged in as {session.name}</span>
                    ) : (
                      <span className="text-lp-ink">Log in</span>
                    )}
                    <ArrowRight className={`size-4 shrink-0 text-lp-muted ${ease} group-hover:translate-x-1 group-hover:text-lp-green`} />
                  </span>
                </Link>

                {/* phones: the timeline line down to the next card */}
                {!last && <span aria-hidden className="absolute -bottom-6 left-9 h-6 w-0.5 bg-lp-rule lg:hidden" />}

                {/* desktop: the arrow towards the next step, appearing after the card */}
                {arrow && (
                  <motion.span
                    aria-hidden={!arrow.label}
                    title={arrow.label}
                    className={`absolute z-10 hidden size-8 place-items-center rounded-full border border-lp-line bg-white text-lp-green shadow-[0_8px_20px_-10px_rgba(16,33,28,0.3)] lg:grid ${arrow.at}`}
                    initial={{ opacity: 0, scale: 0.6 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, ease: EASE, delay: 0.4 + i * 0.07 }}
                  >
                    <ArrowIcon className="size-4" />
                    {arrow.label && <span className="sr-only">{arrow.label}</span>}
                  </motion.span>
                )}
              </Reveal>
            );
          })}
        </ol>

        {support.length > 0 && (
          <Reveal className="mt-16">
            <p className="text-sm font-semibold text-lp-muted">Alongside the whole flow</p>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2">
              {support.map(({ portal, label, note, icon: Icon }) => {
                const session = sessions[portal.role];
                return (
                  <li key={portal.role}>
                    <Link
                      {...portalLink(portal, session)}
                      className={`group flex items-center gap-4 rounded-2xl border bg-white p-4 ${ease} hover:-translate-y-1 hover:border-lp-green active:scale-[0.98] ${focusRing} ${
                        session ? "border-lp-portal-on" : "border-lp-line"
                      }`}
                    >
                      <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${ease} ${session ? "bg-lp-green text-white" : "bg-lp-tint text-lp-green group-hover:bg-lp-green group-hover:text-white"}`}>
                        <Icon className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="block text-base font-semibold text-lp-ink">{label}</strong>
                        <span className="block text-sm text-lp-muted">{session ? `Logged in as ${session.name}` : note}</span>
                      </span>
                      <ArrowRight className={`size-4 shrink-0 text-lp-muted ${ease} group-hover:translate-x-1 group-hover:text-lp-green`} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Reveal>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ tagline */

const TAGLINE = "A shortfall should show up on the material check, not on the shop floor.";

/* Each word lights up from a muted tone to full ink, in reading order, as the section scrolls through. */
function TaglineReveal() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.45"] });
  const words = TAGLINE.split(" ");

  return (
    <section ref={ref} className="py-24 lg:py-32">
      <div className={wrap}>
        <p className="max-w-[680px] font-lp-head text-4xl font-bold tracking-tight text-balance text-lp-ink sm:text-5xl">
          {words.map((w, i) => (
            <Word key={i} progress={scrollYProgress} range={[i / words.length, (i + 1) / words.length]}>
              {w}
            </Word>
          ))}
        </p>
      </div>
    </section>
  );
}

function Word({ children, progress, range }) {
  const opacity = useTransform(progress, range, [0.28, 1], { ease: (t) => 1 - Math.pow(1 - t, 3) });
  return (
    <motion.span style={{ opacity }} className="inline">
      {children}{" "}
    </motion.span>
  );
}

/* ------------------------------------------------------------------ modules */

function Modules() {
  return (
    <section id="modules" className="scroll-mt-24 py-20 lg:py-24">
      <div className={wrap}>
        <SectionHead eyebrow="Modules" title="Everything a component driven factory runs on" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map(({ icon: Icon, name, text }, i) => (
            <Reveal key={name} delay={(i % 4) * 0.06}>
              <div className={`group h-full rounded-2xl border border-lp-line bg-white p-6 ${ease} hover:-translate-y-1 hover:shadow-[0_24px_48px_-28px_rgba(16,33,28,0.3)]`}>
                <span className={`grid size-10 place-items-center rounded-lg bg-lp-tint text-lp-green ${ease} group-hover:scale-110`}>
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-4 text-base font-semibold text-lp-ink">{name}</h3>
                <p className="mt-1 text-sm text-pretty text-lp-muted">{text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ roles */

function Access() {
  return (
    <section id="access" className="scroll-mt-24 border-y border-lp-line bg-white py-20 lg:py-24">
      <div className={wrap}>
        <SectionHead
          eyebrow="Roles"
          title="Each role sees only what it needs"
          text="Access is enforced on the server as well as in the screens."
        />
        <Reveal>
          <div className="overflow-x-auto rounded-2xl border border-lp-line">
            <table data-cards="off" className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-lp-line bg-lp-bg">
                  {["Role", "Can edit", "Can only view"].map((h) => (
                    <th key={h} className="px-6 py-4 text-left text-xs font-semibold text-lp-muted">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ACCESS_ROWS.map((r) => (
                  <tr key={r.role} className={`border-b border-lp-line last:border-b-0 ${ease} hover:bg-lp-soft`}>
                    <th scope="row" className="px-6 py-4 text-left align-top font-semibold whitespace-nowrap text-lp-ink">
                      {r.role}
                    </th>
                    <td className="px-6 py-4 text-left align-top text-lp-text">{r.edit}</td>
                    <td className="px-6 py-4 text-left align-top text-lp-muted">{r.view}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ faq */

function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="scroll-mt-24 py-20 lg:py-24">
      <div className={`${wrap} grid gap-12 lg:grid-cols-[1fr_1.5fr]`}>
        <SectionHead eyebrow="FAQ" title="Questions people ask on their first day" />
        <Reveal>
          <ul className="grid gap-3">
            {FAQ.map(({ q, a }, i) => {
              const isOpen = open === i;
              return (
                <li key={q} className="rounded-2xl border border-lp-line bg-white">
                  <h3>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={`faq-${i}`}
                      onClick={() => setOpen(isOpen ? -1 : i)}
                      className={`flex w-full items-center justify-between gap-4 rounded-2xl px-6 py-4 text-left text-base font-semibold text-lp-ink ${focusRing}`}
                    >
                      {q}
                      <Plus className={`size-5 shrink-0 text-lp-green ${ease} ${isOpen ? "rotate-45" : ""}`} />
                    </button>
                  </h3>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        id={`faq-${i}`}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.6, ease: EASE }}
                        className="overflow-hidden"
                      >
                        <p className="px-6 pb-6 text-sm text-pretty text-lp-text">{a}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ final cta */

function FinalCta({ loginLabel }) {
  return (
    <section className="px-4 pb-20 sm:px-6">
      <Reveal className="mx-auto max-w-6xl rounded-3xl bg-lp-deep px-6 py-16 text-center sm:px-12">
        <h2 className="mx-auto max-w-[680px] font-lp-head text-3xl font-bold tracking-tight text-balance text-white sm:text-4xl">
          Ready to get back to work?
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-lg text-pretty text-white/70">
          Pick your role, log in, and your dashboard shows exactly what is waiting for you today.
        </p>
        <a
          href="#login"
          className={`mt-8 inline-flex items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-base font-semibold text-lp-deep ${ease} hover:-translate-y-0.5 hover:bg-lp-tint active:translate-y-px active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-lp-deep`}
        >
          {loginLabel} <ArrowRight className="size-4" />
        </a>
      </Reveal>
    </section>
  );
}
