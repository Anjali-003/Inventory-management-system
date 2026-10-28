// website ka common UI banata hai, jaise header, sidebar, navigation aur page display.

import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { AnimatePresence, motion } from "motion/react";
import { GiHamburgerMenu } from "react-icons/gi";
import { TiPinOutline } from "react-icons/ti";
import { VscUnpin } from "react-icons/vsc";
import {
  X,
  Boxes,
  ClipboardList,
  ClipboardCheck,
  PackageCheck,
  Factory,
  History,
  LayoutDashboard,
  Warehouse,
  Users,
  CalendarCheck,
  Activity,
  ShoppingCart,
  Truck,
  Package,
  PackageOpen,
  Wrench,
  Route,
  BarChart3,
  FileText,
  Receipt,
  Contact,
} from "lucide-react";

import { cn } from "../lib/utils";
import { authService } from "@/features/auth/authService"
import { disablePush } from "@/lib/push";
import { baseApi } from "../api/baseApi";
import { usePermissions } from "@/features/auth/usePermissions";
import NotificationBell from "@/features/notifications/NotificationBell";
import ProfileMenu from "@/features/auth/ProfileMenu";
import { ROLE_LABELS, clearActiveRole, loginPathFor, setViewAs } from "@/lib/permissions";

/*
  The sidebar follows the work, in order: an order comes in -> components are bought and checked -> Store keeps
  and issues them -> Production builds and QC checks -> the goods are packed, billed and delivered.
  Each role only sees the pages it may open, so every role gets a short list in the same order.
*/
const GROUPS = [
  {
    label: "Overview",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, module: "dashboard", end: true },
      { to: "/order-tracker", label: "Order Tracker", icon: Route, module: "orderTracker" },
      { to: "/reports", label: "Reports", icon: BarChart3, module: "reports" },
      { to: "/activity", label: "Activity", icon: Activity, module: "activity" },
    ],
  },
  {
    label: "1 · Orders",
    items: [
      { to: "/marketing-orders", label: "Customer Orders", icon: ClipboardList, module: "marketingOrders" },
      { to: "/order-approvals", label: "Orders to Approve", icon: ClipboardCheck, module: "orderApprovals" },
      { to: "/approved-orders", label: "Approved Orders", icon: ClipboardList, module: "approvedOrders" },
      { to: "/orders", label: "All Orders", icon: ClipboardList, module: "orders" },
    ],
  },
  {
    label: "2 · Buying",
    items: [
      { to: "/purchase-requests", label: "What to Buy", icon: ClipboardList, module: "purchase" },
      { to: "/purchase", label: "Purchase Orders", icon: ShoppingCart, module: "purchase" },
      { to: "/iqc", label: "IQC Check", icon: ClipboardCheck, module: "iqc" },
    ],
  },
  {
    label: "3 · Store",
    items: [
      { to: "/incoming-stock", label: "Receive from IQC", icon: Truck, module: "incomingStock" },
      { to: "/store-material-requests", label: "Issue to Production", icon: PackageOpen, module: "storeMaterialRequests" },
      { to: "/inventory", label: "Component Stock", icon: Warehouse, module: "inventory" },
      { to: "/product-stock", label: "Product Stock", icon: Package, module: "productStock" },
      { to: "/inventory-history", label: "Stock History", icon: History, module: "inventoryHistory" },
    ],
  },
  {
    label: "4 · Production",
    items: [
      { to: "/production", label: "Production", icon: Factory, module: "production" },
      { to: "/quality-control", label: "Quality Check (QC)", icon: ClipboardCheck, module: "qualityControl" },
      { to: "/qc-failed", label: "QC Failed / Rework", icon: Wrench, module: "qcFailed" },
    ],
  },
  {
    label: "5 · Dispatch",
    items: [
      { to: "/finished-goods", label: "Finished Goods & Dispatch", icon: PackageCheck, module: "finishedGoods" },
    ],
  },
  {
    label: "6 · Sales & Billing",
    items: [
      { to: "/finished-goods?status=IN_STORE", label: "To Bill", icon: FileText, module: "sales" },
      { to: "/bills", label: "Bills & Payments", icon: Receipt, module: "sales" },
      { to: "/customers", label: "Customers", icon: Contact, module: "customers" },
    ],
  },
  {
    label: "Setup",
    items: [
      { to: "/products", label: "Products & BOM", icon: Boxes, module: "products" },
    ],
  },
  {
    label: "HR",
    items: [
      { to: "/employees", label: "Employees", icon: Users, module: "employees" },
      { to: "/attendance", label: "Attendance", icon: CalendarCheck, module: "attendance" },
    ],
  },
];

/*
  Two entries can open the same page with a different filter ("To Bill" = Finished Goods ?status=IN_STORE). The one
  whose filter is in the address is the active one; the plain entry is active only when no such filter is.
*/
const FILTERED = GROUPS.flatMap((g) => g.items).filter((i) => i.to.includes("?")).map((i) => i.to.split("?"))
function useOwnsPage(to) {
  const { search } = useLocation()
  const [, query] = to.split("?")
  if (query) return search.includes(query)
  return !FILTERED.some(([path, q]) => path === to && search.includes(q))
}

function NavItem({ to, label, icon: Icon, end, id }) {
  const owns = useOwnsPage(to)
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive: matched }) => {
        const isActive = matched && owns
        return cn(
          "relative flex items-center gap-3 rounded-[9px] px-3 py-2 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          isActive
            ? "font-semibold text-sidebar-accent-foreground"
            : "text-sidebar-foreground hover:bg-muted hover:text-foreground",
        )
      }}
    >
      {({ isActive: matched }) => (
        <>
          {matched && owns && (
            <motion.span
              layoutId={`nav-active-${id}`}
              className="absolute inset-0 rounded-[9px] bg-sidebar-accent ring-1 ring-inset ring-primary/15"
              transition={{
                type: "spring",
                stiffness: 500,
                damping: 40,
              }}
            />
          )}

          <Icon className="relative size-[18px]" />

          <span className="relative">{label}</span>
        </>
      )}
    </NavLink>
  );
}

/*
  Roles whose sidebar is their own work, not every page they are allowed to look at. The other pages keep their
  permission (dashboard links still open them); they just do not crowd the sidebar.
*/
const DASHBOARD = GROUPS[0].items[0];
const ROLE_GROUPS = {
  MARKETING_MANAGER: [
    {
      label: "Sales",
      items: [
        DASHBOARD,
        { to: "/marketing-orders", label: "Customer Orders", icon: ClipboardList, module: "marketingOrders" },
        { to: "/order-tracker", label: "Order Tracker", icon: Route, module: "orderTracker" },
      ],
    },
    {
      label: "Billing",
      items: [
        { to: "/finished-goods?status=IN_STORE", label: "To Bill", icon: FileText, module: "sales" },
        { to: "/bills", label: "Bills & Payments", icon: Receipt, module: "sales" },
        { to: "/customers", label: "Customers", icon: Contact, module: "customers" },
      ],
    },
  ],
  OPERATIONS_ADMIN: [
    {
      label: "My work",
      items: [
        DASHBOARD,
        { to: "/order-approvals", label: "Orders", icon: ClipboardCheck, module: "orderApprovals" },
        { to: "/order-tracker", label: "Order Tracker", icon: Route, module: "orderTracker" },
        { to: "/reports", label: "Reports", icon: BarChart3, module: "reports" },
      ],
    },
    {
      label: "Keep an eye on",
      items: [
        { to: "/inventory", label: "Component Stock", icon: Warehouse, module: "inventory" },
        { to: "/purchase", label: "Parts being bought", icon: ShoppingCart, module: "purchase" },
        { to: "/finished-goods", label: "Finished Goods", icon: PackageCheck, module: "finishedGoods" },
      ],
    },
  ],
};

function NavList({ id }) {
  const { canView, role } = usePermissions();

  // only the pages this role may open; a group with no visible page is hidden completely
  const groups = (ROLE_GROUPS[String(role || "").toUpperCase()] || GROUPS).map((g) => ({
    ...g,
    items: g.items.filter((i) => canView(i.module)),
  })).filter((g) => g.items.length > 0);

  return (
    <nav className="flex flex-col gap-5 p-3 pt-4">
      {groups.map((g) => (
        <div key={g.label} className="flex flex-col gap-1">
          <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.6px] text-cf-faint">
            {g.label}
          </p>

          {/* eslint-disable-next-line no-unused-vars */}
          {g.items.map(({ module, ...i }) => (
            <NavItem key={i.to} id={id} {...i} />
          ))}
        </div>
      ))}
    </nav>
  );
}

function SidebarBody({ id, pinned, onTogglePin, onLogout }) {
  return (
    <div className="flex min-h-full w-60 flex-col">
      <div className="flex h-11 items-center justify-between border-b px-4">
        <span className="text-[10px] font-bold uppercase tracking-[0.6px] text-cf-faint">
          Menu
        </span>

        <button
          aria-label={pinned ? "Unpin sidebar" : "Pin sidebar"}
          aria-pressed={pinned}
          title={pinned ? "Unpin sidebar" : "Pin sidebar"}
          onClick={onTogglePin}
          className="grid size-8 place-items-center rounded-lg text-sidebar-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {pinned ? <VscUnpin className="size-5" /> : <TiPinOutline className="size-5" />}
        </button>
      </div>

      <NavList id={id} />

      <div className="mt-auto px-3 pb-4">
        <button
          onClick={onLogout}
          className="w-full rounded-[9px] px-3 py-2 text-left text-[13px] font-medium text-sidebar-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Logout
        </button>
      </div>
    </div>
  );
}

// pathname isi liye use ho raha hai, taaki page badalne par sidebar band ho aur naya page animation ke saath dikhe.
//usePermissions() ek object return kar raha hai, jisme user, role, roleLabel, loading, canView, canEdit aur homePath properties hain.
/* Super Admin: "View as" any role without logging in as it (see lib/permissions.js VIEW AS) */
const VIEW_AS_ROLES = ["MARKETING_MANAGER", "OPERATIONS_ADMIN", "PURCHASE_MANAGER", "IQC_MANAGER", "STORE_MANAGER", "PRODUCTION_MANAGER", "QUALITY_FG_MANAGER", "HR_MANAGER"];
function ViewAsSwitcher({ value, onChange }) {
  return (
    <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
      <span className="hidden sm:inline">View as</span>
      <select aria-label="View the app as" value={value || ""} onChange={(e) => onChange(e.target.value || null)}
        className={cn("h-8 rounded-full border px-2 text-xs font-semibold", value ? "border-amber-400 bg-amber-50 text-amber-950" : "bg-card text-foreground")}>
        <option value="">Super Admin (me)</option>
        {VIEW_AS_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
      </select>
    </label>
  );
}

export default function Layout() {
  const { pathname } = useLocation();
  const { user, roleLabel, realRole, viewingAs } = usePermissions();

  const navigate = useNavigate();
  const dispatch = useDispatch();

  const [open, setOpen] = useState(false); // mobile drawer
  const [pinned, setPinned] = useState(false); // desktop: fixed in the layout (default: unpinned)
  const [floatOpen, setFloatOpen] = useState(false); // desktop: floating over the page while unpinned

  useEffect(() => {
    setOpen(false);
    setFloatOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!floatOpen) return;
    const onKey = (e) => e.key === "Escape" && setFloatOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [floatOpen]);

  const togglePin = () => {
    setPinned((p) => !p);
    setFloatOpen(false);
  };

  // Super Admin: show the app as another role (or back), starting from that role's dashboard
  const viewAs = (role) => {
    setViewAs(role);
    navigate("/dashboard");
  };

  const handleLogout = async () => {
    try {
      await disablePush(); // this browser stops getting this role's phone / desktop notifications
      await authService.logout(); // clears only THIS role's login; other roles stay logged in
      clearActiveRole();
      dispatch(baseApi.util.resetApiState()); // never show the previous user's cached data

      navigate(loginPathFor(user?.role)); // back to the login page of THIS role
    } catch (error) {
      console.error(error);
    }
  };

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-white/85 px-3 text-foreground backdrop-blur-md md:px-6">
        <div className="flex items-center gap-2 md:gap-3">
          <button
            aria-label="Open menu"
            onClick={() => setOpen(true)}
            className="grid size-9 place-items-center rounded-lg hover:bg-muted md:hidden"
          >
            <GiHamburgerMenu className="size-5" />
          </button>

          <button
            aria-label="Toggle sidebar"
            aria-expanded={pinned || floatOpen}
            onClick={() => setFloatOpen((o) => !o)}
            className={cn(
              "hidden size-9 place-items-center rounded-lg hover:bg-muted md:grid",
              pinned && "md:invisible",
            )}
          >
            <GiHamburgerMenu className="size-5" />
          </button>

          <img
            src="/ss_logo.png"
            alt="Sensation Systems"
            className="size-8 rounded-lg bg-white object-contain ring-1 ring-border"
          />

          <div className="hidden leading-none md:block">
            <p className="text-lg font-bold italic tracking-tight text-primary">
              Sensation Systems
            </p>

            <p className="mt-0.5 text-[11px] font-medium text-primary"></p>
          </div>
        </div>

        {roleLabel && (
          <p className="min-w-0 flex-1 truncate px-2 text-center text-base font-extrabold uppercase tracking-wide text-primary sm:text-xl lg:text-2xl">
            {roleLabel}
          </p>
        )}

        <div className="flex items-center gap-2 sm:gap-4">
          <span className="hidden text-xs text-muted-foreground xl:block">{today}</span>

          {realRole === "SUPER_ADMIN" && <ViewAsSwitcher value={viewingAs} onChange={viewAs} />}

          {user && <NotificationBell />}

          {user && (
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-xs font-semibold">{user.name}</p>
              <p className="text-[11px] text-muted-foreground">{roleLabel}</p>
            </div>
          )}

          <ProfileMenu user={user} roleLabel={roleLabel} onLogout={handleLogout} />
        </div>
      </header>

      {viewingAs && (
        <div className="sticky top-14 z-20 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-300 bg-amber-50 px-3 py-1.5 text-center text-xs text-amber-950">
          <span>You are viewing the app as <b>{ROLE_LABELS[viewingAs] || viewingAs}</b>. Whatever you do is done as you (Super Admin).</span>
          <button type="button" onClick={() => viewAs(null)} className="rounded-full bg-amber-900 px-2.5 py-0.5 font-semibold text-white hover:bg-amber-800">Back to Super Admin</button>
        </div>
      )}

      <div className="md:flex">
        {/* Desktop, pinned: sits in the layout, so the page shrinks to fit */}
        <motion.aside
          className="hidden shrink-0 overflow-hidden bg-sidebar md:sticky md:top-14 md:block md:h-[calc(100vh-3.5rem)]"
          initial={false}
          animate={{ width: pinned ? 240 : 0 }}
          transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
          style={{ borderRightWidth: pinned ? 1 : 0 }}
          aria-hidden={!pinned}
          inert={!pinned}
        >
          <div className="h-full w-60 overflow-y-auto">
            <SidebarBody id="pinned" pinned onTogglePin={togglePin} onLogout={handleLogout} />
          </div>
        </motion.aside>

        {/* Desktop, unpinned: floats over the page */}
        <AnimatePresence>
          {!pinned && floatOpen && (
            <>
              <motion.div
                key="float-backdrop"
                className="fixed inset-x-0 bottom-0 top-14 z-30 hidden md:block"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setFloatOpen(false)}
              />

              <motion.aside
                key="float-panel"
                className="fixed bottom-0 left-0 top-14 z-40 hidden w-60 overflow-y-auto border-r bg-sidebar shadow-xl md:block"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "tween", duration: 0.2, ease: "easeOut" }}
              >
                <SidebarBody id="float" pinned={false} onTogglePin={togglePin} onLogout={handleLogout} />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {open && (
            <>
              <motion.div
                key="backdrop"
                className="fixed inset-0 z-40 bg-[#101a17]/45 md:hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setOpen(false)}
              />

              <motion.aside
                key="drawer"
                className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] overflow-y-auto bg-sidebar shadow-xl md:hidden"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{
                  type: "tween",
                  duration: 0.25,
                  ease: "easeOut",
                }}
              >
                <div className="flex h-14 items-center justify-between border-b bg-white px-4 text-foreground">
                  <p className="text-lg font-bold italic text-primary">Sensation Systems</p>

                  <button
                    aria-label="Close menu"
                    onClick={() => setOpen(false)}
                    className="grid size-9 place-items-center rounded-lg hover:bg-muted"
                  >
                    <X className="size-5" />
                  </button>
                </div>

                <NavList id="mobile" />

                <div className="px-3 pb-4">
                  <button
                    onClick={handleLogout}
                    className="w-full rounded-[9px] px-3 py-2 text-left text-[13px] font-medium text-sidebar-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    Logout
                  </button>
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        <main className="min-w-0 flex-1">
          <motion.div
            key={pathname}
            initial={{
              opacity: 0,
              y: 10,
            }}
            animate={{
              opacity: 1,
              y: 0,
            }}
            transition={{
              duration: 0.25,
              ease: "easeOut",
            }}
            className="w-full px-4 py-5 md:px-8 md:py-6"
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}
