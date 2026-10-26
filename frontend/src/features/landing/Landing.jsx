import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AnimatePresence, motion, useInView, useScroll, useTransform } from "motion/react";
import { EASE, Reveal, SectionHead, btnPrimary, ease, focusRing, wrap } from "@/features/site/siteKit";
import SiteShell from "@/features/site/SiteShell";
import {
  ShieldCheck,
  Warehouse,
  ClipboardCheck,
  ShoppingCart,
  ArrowRight,
  Factory,
  PackageCheck,
  Truck,
  Activity,
  UserCog,
  Plus,
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
  { portal: LOGIN_PORTALS.PRODUCTION_ADMIN, label: "Production Admin", note: "Manage production, quality, finished goods and inventory", icon: Factory },
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

  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" }), 50);
    return () => clearTimeout(t);
  }, [hash]);

  const signedInCount = Object.keys(sessions).length;
  const loginLabel = signedInCount > 0 ? "Open your workspace" : "Log in to your workspace";

  return (
    <SiteShell signedIn={signedInCount > 0}>
      <Hero loginLabel={loginLabel} />
      <Portals sessions={sessions} />
      <TaglineReveal />
      <Faq />
      <FinalCta loginLabel={loginLabel} />
    </SiteShell>
  );
}

/* ------------------------------------------------------------------ hero */

function Hero({ loginLabel }) {
  const stats = [
    ["10", "role workspaces"],
    ["1", "login per role, side by side"],
    ["Live", "updates in every tab"],
  ];
  return (
    <section className="pt-40 pb-20 lg:pt-48 lg:pb-24">
      <div className={`${wrap} grid items-center gap-16 lg:grid-cols-2`}>
        <div>
          <Reveal immediate>
            <span className="inline-flex items-center gap-2 rounded-full border border-lp-line bg-white px-3 py-1 text-sm font-medium text-lp-text">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-lp-green opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex size-2 rounded-full bg-lp-green" />
              </span>
              Electronics production and inventory, in one place
            </span>
          </Reveal>
          <Reveal immediate delay={0.08}>
            <h1 className="mt-6 max-w-[680px] bg-linear-to-r from-black to-[#666666] bg-clip-text pb-1 font-lp-head text-4xl font-bold tracking-tight text-balance text-transparent sm:text-5xl">
              Know every missing component before the line stops.
            </h1>
          </Reveal>
          <Reveal immediate delay={0.16}>
            <p className="mt-6 max-w-[680px] text-lg text-pretty text-lp-text">
              EPIMS keeps production, inventory, quality and purchasing in one system, so a shortfall shows up on the
              material check, not on the shop floor.
            </p>
          </Reveal>
          <Reveal immediate delay={0.24} className="mt-8 flex flex-wrap items-center gap-4">
            <a href="#login" className={btnPrimary}>
              {loginLabel} <ArrowRight className="size-4" />
            </a>
          </Reveal>
          <Reveal immediate delay={0.32}>
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

        <Reveal immediate delay={0.2}>
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
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-success">
                        <CircleCheck className="size-3.5" /> Ready
                      </span>
                    )}
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-lp-tint">
                    <motion.div
                      className={`h-full rounded-full ${short ? "bg-warning" : "bg-success"}`}
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

/* ------------------------------------------------------------------ logins */

// the order people work in (marketing -> ... -> quality & finished goods), then the roles beside the flow
const ORDER = [
  "MARKETING_MANAGER", "OPERATIONS_ADMIN", "PURCHASE_MANAGER", "IQC_MANAGER", "STORE_MANAGER",
  "PRODUCTION_MANAGER", "PRODUCTION_ADMIN", "QUALITY_FG_MANAGER", "HR_MANAGER", "SUPER_ADMIN",
];
const PORTALS_IN_ORDER = [...AVAILABLE_PORTAL_CARDS].sort(
  (a, b) => (ORDER.indexOf(a.portal.role) + 1 || 99) - (ORDER.indexOf(b.portal.role) + 1 || 99)
);

/* One login card per role. A role already logged in on this browser opens its dashboard straight away. */
function Portals({ sessions }) {
  return (
    <section id="login" className="scroll-mt-24 border-y border-lp-line bg-white py-20 lg:py-24">
      <div className={wrap}>
        <SectionHead
          eyebrow="Log in"
          title="Choose your workspace"
          text="Every role has its own login. You can stay logged in to several roles at once, one per browser tab."
        />
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PORTALS_IN_ORDER.map(({ portal, label, note, icon: Icon }, i) => {
            const session = sessions[portal.role];
            return (
              <Reveal as="li" key={portal.role} delay={(i % 3) * 0.06}>
                <Link
                  {...portalLink(portal, session)}
                  className={`group flex h-full items-center gap-4 rounded-2xl border bg-white p-4 ${ease} hover:-translate-y-1 hover:border-lp-green hover:shadow-[0_24px_48px_-24px_rgba(122,53,255,0.35)] active:scale-[0.98] ${focusRing} ${
                    session ? "border-lp-portal-on" : "border-lp-line"
                  }`}
                >
                  <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${ease} ${session ? "bg-lp-green text-white" : "bg-lp-tint text-lp-green group-hover:bg-lp-green group-hover:text-white"}`}>
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <strong className="text-base font-semibold text-lp-ink">{label}</strong>
                      {session && <span className="rounded-full bg-lp-tint px-2 py-0.5 text-xs font-semibold text-lp-green">Logged in</span>}
                    </span>
                    <span className="mt-0.5 block text-sm text-pretty text-lp-muted">
                      {session ? `Continue as ${session.name}` : note}
                    </span>
                  </span>
                  <ArrowRight className={`size-4 shrink-0 text-lp-muted ${ease} group-hover:translate-x-1 group-hover:text-lp-green`} />
                </Link>
              </Reveal>
            );
          })}
        </ul>
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
