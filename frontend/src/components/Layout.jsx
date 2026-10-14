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
} from "lucide-react";

import { cn } from "../lib/utils";
import { authService } from "@/features/auth/authService"
import { baseApi } from "../api/baseApi";
import { usePermissions } from "@/features/auth/usePermissions";
import { clearActiveRole, loginPathFor } from "@/lib/permissions";

const GROUPS = [
  {
    label: "Overview",
    items: [
      {
        to: "/dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        module: "dashboard",
        end: true,
      },
      {
        to: "/activity",
        label: "Activity",
        icon: Activity,
        module: "activity",
      },
    ],
  },

  {
    label: "Catalog",
    items: [
      {
        to: "/products",
        label: "Products",
        icon: Boxes,
        module: "products",
      },
      {
        to: "/inventory",
        label: "Inventory",
        icon: Warehouse,
        module: "inventory",
      },
      {
        to: "/inventory-history",
        label: "Inventory History",
        icon: History,
        module: "inventoryHistory",
      },
    ],
  },

  {
    label: "Operations",
    items: [
      {
        to: "/orders",
        label: "Orders",
        icon: ClipboardList,
        module: "orders",
      },
      // {
      //   to: "/existing-orders",
      //   label: "Existing Orders",
      //   icon: History,
      // },
      {
        to: "/production",
        label: "Production",
        icon: Factory,
        module: "production",
      },
      {
        to: "/quality-control",
        label: "Quality Control",
        icon: ClipboardCheck,
        module: "qualityControl",
      },
      {
        to: "/finished-goods",
        label: "Finished Goods",
        icon: PackageCheck,
        module: "finishedGoods",
      },
    ],
  },

  {
    label: "Quality & Purchase",
    items: [
      // the incoming-goods flow, in order: buy -> inspect -> accept into stock
      { to: "/purchase", label: "Purchase", icon: ShoppingCart, module: "purchase" },
      { to: "/iqc", label: "IQC", icon: ClipboardCheck, module: "iqc" },
      { to: "/incoming-stock", label: "Incoming Stock", icon: Truck, module: "incomingStock" },
    ],
  },

  {
    label: "HR",
    items: [
      {
        to: "/employees",
        label: "Employees",
        icon: Users,
        module: "employees",
      },
      {
        to: "/attendance",
        label: "Attendance",
        icon: CalendarCheck,
        module: "attendance",
      },
    ],
  },
];

function NavItem({ to, label, icon: Icon, end, id }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "relative flex items-center gap-3 rounded-[9px] px-3 py-2 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          isActive
            ? "font-semibold text-sidebar-accent-foreground"
            : "text-sidebar-foreground hover:bg-muted hover:text-foreground",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
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

function NavList({ id }) {
  const { canView } = usePermissions();

  // only the pages this role may open; a group with no visible page is hidden completely
  const groups = GROUPS.map((g) => ({
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
export default function Layout() {
  const { pathname } = useLocation();
  const { user, roleLabel } = usePermissions();
  const initials =
    (user?.name || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("") || "--";

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

  const handleLogout = async () => {
    try {
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

          <div className="leading-none">
            <p className="text-lg font-bold italic tracking-tight text-primary">
              Sensation Systems
            </p>

            <p className="mt-0.5 text-[11px] font-medium text-primary"></p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="hidden text-xs text-muted-foreground sm:block">{today}</span>

          {user && (
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-xs font-semibold">{user.name}</p>
              <p className="text-[11px] text-muted-foreground">{roleLabel}</p>
            </div>
          )}

          <span
            title={user ? `${user.name} · ${roleLabel}` : undefined}
            className="grid size-8 place-items-center rounded-full bg-cf-green-soft text-xs font-semibold text-primary ring-1 ring-primary/20"
          >
            {initials}
          </span>
        </div>
      </header>

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
