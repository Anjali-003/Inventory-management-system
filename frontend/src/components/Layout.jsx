import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  Menu,
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
} from "lucide-react";

import { cn } from "../lib/utils";
import api from "../api/api";

const GROUPS = [
  {
    label: "Overview",
    items: [
      {
        to: "/",
        label: "Dashboard",
        icon: LayoutDashboard,
        end: true,
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
      },
      {
        to: "/inventory",
        label: "Inventory",
        icon: Warehouse,
      },
      {
        to: "/inventory-history",
        label: "Inventory History",
        icon: History,
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
      },
      {
        to: "/quality-control",
        label: "Quality Control",
        icon: ClipboardCheck,
      },
      {
        to: "/finished-goods",
        label: "Finished Goods",
        icon: PackageCheck,
      },
    ],
  },

  {
    label: "HR",
    items: [
      {
        to: "/employees",
        label: "Employees",
        icon: Users,
      },
      {
        to: "/attendance",
        label: "Attendance",
        icon: CalendarCheck,
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
          "relative flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          isActive
            ? "text-sidebar-accent-foreground"
            : "text-sidebar-foreground hover:bg-muted hover:text-foreground",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId={`nav-active-${id}`}
              className="absolute inset-0 rounded-sm border-l-[3px] border-primary bg-sidebar-accent"
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
  return (
    <nav className="flex flex-col gap-5 p-3 pt-4">
      {GROUPS.map((g) => (
        <div key={g.label} className="flex flex-col gap-1">
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {g.label}
          </p>

          {g.items.map((i) => (
            <NavItem key={i.to} id={id} {...i} />
          ))}
        </div>
      ))}
    </nav>
  );
}

export default function Layout() {
  const { pathname } = useLocation();

  const navigate = useNavigate();

  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    try {
      await api.post("/auth/logout");

      navigate("/login");
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
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-primary px-3 text-primary-foreground shadow-md md:px-6">
        <div className="flex items-center gap-2 md:gap-3">
          <button
            aria-label="Open menu"
            onClick={() => setOpen(true)}
            className="grid size-9 place-items-center rounded-sm hover:bg-white/10 md:hidden"
          >
            <Menu className="size-5" />
          </button>

          <img
            src="/ss_logo.png"
            alt="Sensation Systems"
            className="size-8 rounded-sm bg-white object-contain"
          />

          <div className="leading-none">
            <p className="text-lg font-bold italic tracking-tight">
              Sensation Systems
            </p>

            <p className="mt-0.5 text-[11px] font-medium text-[#ffe500]"></p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="hidden text-xs text-white/80 sm:block">{today}</span>

          <span className="grid size-8 place-items-center rounded-full bg-white/15 text-xs font-semibold ring-1 ring-white/30">
            AD
          </span>
        </div>
      </header>

      <div className="md:flex">
        <aside className="hidden bg-sidebar md:sticky md:top-14 md:block md:h-[calc(100vh-3.5rem)] md:w-60 md:shrink-0 md:overflow-y-auto md:border-r">
          <NavList id="desktop" />

          <div className="px-3 pb-4">
            <button
              onClick={handleLogout}
              className="w-full rounded-sm px-3 py-2.5 text-left text-sm font-medium text-sidebar-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Logout
            </button>
          </div>
        </aside>

        <AnimatePresence>
          {open && (
            <>
              <motion.div
                key="backdrop"
                className="fixed inset-0 z-40 bg-black/50 md:hidden"
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
                <div className="flex h-14 items-center justify-between bg-primary px-4 text-primary-foreground">
                  <p className="text-lg font-bold italic">Sensation Systems</p>

                  <button
                    aria-label="Close menu"
                    onClick={() => setOpen(false)}
                    className="grid size-9 place-items-center rounded-sm hover:bg-white/10"
                  >
                    <X className="size-5" />
                  </button>
                </div>

                <NavList id="mobile" />

                <div className="px-3 pb-4">
                  <button
                    onClick={handleLogout}
                    className="w-full rounded-sm px-3 py-2.5 text-left text-sm font-medium text-sidebar-foreground transition-colors hover:bg-muted hover:text-foreground"
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
            className={`mx-auto px-4 py-5 md:px-8 md:py-6 ${pathname === "/inventory-history" ? "max-w-none" : "max-w-6xl"}`}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}
