import { useEffect, useRef, useState } from "react";
import { animate, AnimatePresence, motion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { SURFACE, pageButtonClass } from "@/components/PageKit";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fmtQty } from "@/lib/stock";

/*
    Building blocks for the Inventory History page, in the CircuitFlow look (green, soft grey, compact type, DM Sans).
    The look comes from the `.cf-scope` wrapper on the page (see index.css), so everything here is plain Tailwind.

    Exports: CountUp, Reveal, Panel, PanelHeader, CfButton, StatCard, TabBar, TabPanel, Pill, Initials, MonthBars
    and the reason -> colour map.

    Motion rules: everything is wrapped by <MotionConfig reducedMotion="user"> on the page, so people who
    ask their OS for less motion get the same layout without the movement. Only the drawing is computed
    here; every business figure still comes from the server.
*/

const EASE = [0.22, 1, 0.36, 1];

/* ------------------------------------------------------------------ helpers */

// Counts from the previous value to the new one (so changing month "rolls" the number instead of restarting at 0).
export function CountUp({ value, format = fmtQty, duration = 0.9 }) {
  const target = Number(value) || 0;
  const from = useRef(0);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      from.current = target;
      setN(target);
      return;
    }
    const c = animate(from.current, target, {
      duration,
      ease: "easeOut",
      onUpdate: (v) => setN(Math.round(v * 100) / 100),
      onComplete: () => {
        from.current = target;
        setN(target);
      },
    });
    return () => {
      from.current = target;
      c.stop();
    };
  }, [target, duration]);
  return format(n);
}

// Fade + rise on mount. `delay` staggers sections down the page.
export function Reveal({ delay = 0, className, children }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.45, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------- panels */

// White card: thin border, 10px corners, very soft shadow.
export function Panel({ className, children, ...p }) {
  return (
    <section
      className={cn(
        "overflow-hidden",
        SURFACE,
        className,
      )}
      {...p}
    >
      {children}
    </section>
  );
}

// Title + small grey line on the left, anything (buttons, switchers) on the right.
export function PanelHeader({ title, subtitle, className, children }) {
  return (
    <div
      className={cn(
        "flex min-h-[72px] flex-wrap items-center justify-between gap-3 border-b border-lp-line px-5 py-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="font-lp-head text-base font-semibold tracking-tight text-lp-ink">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-0.5 text-xs leading-relaxed text-lp-muted">
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ buttons */

// Same buttons as components/PageKit. CfButton's old names: secondary = outline, ghost = a small violet text button.
const BTN = {
  primary: pageButtonClass("primary", "sm"),
  secondary: pageButtonClass("outline", "sm"),
  ghost: cn(pageButtonClass("ghost", "sm"), "h-8 px-2.5"),
};

export function CfButton({
  variant = "secondary",
  className,
  type = "button",
  ...p
}) {
  return (
    <button
      type={type}
      className={cn(BTN[variant], className)}
      {...p}
    />
  );
}

/* -------------------------------------------------------------------- stats */

// [icon tile, small line under the figure]. The colour lives in the icon only; the figure stays ink.
const STAT_TONE = {
  blue: ["bg-sky-50 text-sky-700", "text-sky-700"],
  violet: ["bg-lp-tint text-lp-green", "text-lp-green"],
  green: ["bg-emerald-50 text-emerald-700", "text-emerald-700"],
  red: ["bg-rose-50 text-rose-700", "font-semibold text-red-700"],
  amber: ["bg-amber-50 text-amber-700", "font-semibold text-amber-700"],
};

const MotionLink = motion.create(Link);

// Icon tile on the left, label, big number, one small line underneath. (Icon sits on top on phones.)
export function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "blue",
  loading,
  index = 0,
  format = fmtQty,
  badge,
  onClick,
  active,
  chart = null,
  title,
  to,
}) {
  const [tile, detailCls] = STAT_TONE[tone] || STAT_TONE.blue;
  // a page to go to is a real link (opens in a new tab with a middle click); an action on this page is a button
  const Tag = to ? MotionLink : onClick ? motion.button : motion.div;
  const live = !!(to || onClick);
  return (
    <Tag
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.4, ease: EASE }}
      whileHover={{ y: -2 }}
      {...(to ? { to } : onClick ? { type: "button", onClick, "aria-pressed": active } : {})}
      title={title}
      className={cn(SURFACE, "group relative min-h-[122px] overflow-hidden py-5 pl-[68px] pr-5 transition-[transform,border-color] duration-200 hover:border-lp-rule max-sm:min-h-[142px] max-sm:pl-4 max-sm:pt-[61px]", live && "block w-full cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-lp-green", active && "border-lp-green ring-2 ring-lp-green/20")}
    >
      {live && (
        <ArrowUpRight
          aria-hidden
          className="absolute right-3.5 top-4 size-4 text-slate-400 opacity-60 transition-[transform,opacity,color] duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary group-hover:opacity-100 group-focus-visible:text-primary group-focus-visible:opacity-100"
        />
      )}
      <span
        className={cn(
          "absolute left-4 top-5 grid size-10 place-items-center rounded-xl max-sm:top-3.5",
          tile,
        )}
      >
        <Icon className="size-[18px]" strokeWidth={2.1} aria-hidden />
      </span>
      <p className="text-[13px] font-semibold text-lp-muted">
        {label}
      </p>
      {loading ? (
        <Skeleton className="my-2 h-8 w-24 rounded-md" />
      ) : (
        <div className="my-1 flex items-end justify-between gap-3">
          <p className="text-[28px] font-bold leading-tight tracking-tight text-lp-ink tabular-nums">
            {/* only a number counts up; a figure already written out ("₹32,961", "22%") shows as it is */}
            {value === null || value === undefined ? "-" : typeof value === "number" ? <CountUp value={value} format={format} /> : value}
          </p>
          {chart}
        </div>
      )}
      {!loading && (detail || badge) && (
        <div className="flex flex-wrap items-center gap-2">
          {badge}
          {detail && <p className={cn("text-xs", detailCls)}>{detail}</p>}
        </div>
      )}
    </Tag>
  );
}

/* --------------------------------------------------------------------- tabs */

// A grey pill with a white "selected" chip that slides between the options.
export function TabBar({ tabs, value, onChange, label }) {
  const onKeyDown = (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = tabs.findIndex((t) => t.key === value);
    const next =
      tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
    onChange(next.key);
    document.getElementById(`history-tab-${next.key}`)?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-[9px] border border-slate-200 bg-green-400 p-1"
    >
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            id={`history-tab-${t.key}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`history-panel-${t.key}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.key)}
            className={cn(
              "relative inline-flex  items-center gap-1.5 whitespace-nowrap rounded-[6px] px-3 py-[7px] text-[11px] outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring/50",
              active
                ? "font-bold text-primary"
                : "font-medium text-muted-foreground hover:bg-white/60 hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId="history-tab-chip"
                className="absolute inset-0 rounded-[6px] bg-white shadow-[0_2px_5px_rgba(18,44,34,0.1)] ring-1 ring-primary/10"
                transition={{ type: "spring", stiffness: 460, damping: 32 }}
              />
            )}
            <span className="relative inline-flex items-center gap-1.5 text-black ">
              {t.label}
              {t.badge}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Cross-fades the tab content when the tab changes.
export function TabPanel({ id, children }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={id}
        role="tabpanel"
        id={`history-panel-${id}`}
        aria-labelledby={`history-tab-${id}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className=""
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/* -------------------------------------------------------------------- pills */

const PILL = {
  success: "bg-cf-green-soft text-primary",
  danger: "bg-cf-red-soft text-destructive",
  warning: "bg-cf-amber-soft text-warning",
  info: "bg-cf-blue-soft text-cf-blue",
  neutral: "bg-muted text-muted-foreground",
};
const DOT = {
  success: "bg-primary",
  danger: "bg-destructive",
  warning: "bg-warning",
  info: "bg-cf-blue",
  neutral: "bg-muted-foreground/60",
};

export function Pill({
  tone = "neutral",
  dot = false,
  pulse = false,
  className,
  children,
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-[9px] py-1 text-[10px] font-semibold",
        PILL[tone],
        className,
      )}
    >
      {dot && (
        <span className="relative grid size-1.5 place-items-center">
          {pulse && (
            <span
              className={cn(
                "absolute inline-flex size-full animate-ping rounded-full opacity-60",
                DOT[tone],
              )}
            />
          )}
          <span className={cn("relative size-1.5 rounded-full", DOT[tone])} />
        </span>
      )}
      {children}
    </span>
  );
}

// Reason colour: loss / damage in red, checks and trials in blue, count corrections in amber, everything else quiet.
const REASON_TONE = {
  DAMAGED: "danger",
  PRODUCTION_WASTAGE: "danger",
  LOST: "danger",
  WRONG_ISSUE: "danger",
  QUALITY_CONTROL: "info",
  TESTING: "info",
  SAMPLE_TESTING: "info",
  RND: "info",
  REWORK: "info",
  CUSTOMER_SAMPLE: "info",
  ADJUSTMENT: "warning",
};
export const reasonTone = (code) => REASON_TONE[code] || "neutral";

export function Initials({ name, className }) {
  const letters = String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-lg bg-cf-green-soft text-[11px] font-bold text-primary",
        className,
      )}
    >
      {letters}
    </span>
  );
}

/* ----------------------------------------------------------------- month bars */

// One bar per month for a whole year, spread evenly across the full width (12 equal columns), over faint guide lines.
// rows: [{ key: "2026-03", value, disabled }]. A disabled month has no data yet (before the first
// receipt or after the latest month): it shows a faint stub and can't be opened.
export function MonthBars({
  rows,
  activeKey,
  onSelect,
  formatValue,
  formatLabel,
  formatAria,
}) {
  if (!rows || rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => r.value), 0);
  return (
    <div className="relative" role="group" aria-label="Received per month">
      {/* guide lines sit behind the bars: top = value row (16px) + gap (6px) */}
      <div
        aria-hidden
        className="cf-guides pointer-events-none absolute inset-x-0 top-[22px] h-36 border-b"
      />
      <div
        className="relative grid gap-1.5 sm:gap-2.5"
        style={{
          gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))`,
        }}
      >
        {rows.map((r, i) => {
          const active = r.key === activeKey;
          const empty = r.disabled || r.value <= 0;
          const pct =
            empty || max <= 0 ? 2 : Math.max(5, (r.value / max) * 100);
          return (
            <button
              key={r.key}
              type="button"
              disabled={r.disabled}
              onClick={() => onSelect?.(r.key)}
              aria-label={
                r.disabled
                  ? `${(formatAria || formatLabel)(r.key)}: no data`
                  : `${(formatAria || formatLabel)(r.key)}: ${formatValue(r.value)} received`
              }
              aria-current={active || undefined}
              className="group flex min-w-0 flex-col items-center gap-1.5 rounded-lg outline-none transition-colors hover:bg-white/55 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default"
            >
              <span
                className={cn(
                  "h-4 whitespace-nowrap text-[10px] font-bold tabular-nums transition-opacity",
                  active
                    ? "text-primary opacity-100"
                    : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
                )}
              >
                {r.disabled ? "" : formatValue(r.value)}
              </span>
              <span className="flex h-36 w-full items-end justify-center">
                <motion.span
                  initial={{ height: 0 }}
                  animate={{ height: `${pct}%` }}
                  transition={{
                    delay: 0.1 + i * 0.04,
                    duration: 0.6,
                    ease: EASE,
                  }}
                  whileHover={{ scaleX: 1.08 }}
                  style={{ transformOrigin: "bottom" }}
                  className={cn(
                    "w-[58%] min-w-3 rounded-t-[5px] transition-colors",
                    r.disabled
                      ? "bg-slate-200"
                      : active
                        ? "bg-gradient-to-t from-emerald-700 via-primary to-emerald-400 shadow-[0_5px_14px_rgba(122, 53, 255,0.3)] ring-1 ring-emerald-700/15"
                        : empty
                          ? "bg-emerald-700/20 group-hover:bg-emerald-700/35"
                          : "bg-gradient-to-t from-emerald-700/55 to-emerald-500/65 group-hover:from-emerald-700/75 group-hover:to-emerald-500/85",
                  )}
                />
              </span>
              <span
                className={cn(
                  "truncate text-[10px]",
                  active
                    ? "font-bold text-foreground"
                    : r.disabled
                      ? "font-medium text-cf-faint/70"
                      : "font-medium text-cf-faint group-hover:text-muted-foreground",
                )}
              >
                {formatLabel(r.key)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
