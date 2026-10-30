import { cn } from "@/lib/utils";
import { fmtQty } from "@/lib/stock";
import { motion } from "motion/react";

/*
    "Should be" vs "Actually in stock", side by side, with the gap (5) between them drawn on the actual bar.
    The numbers here are very far apart in size (e.g. 154,000 received vs 114 missing), so a chart of everything
    would hide the gap. This one is zoomed in on lines 3, 4 and 5: when the gap is small compared with the stock,
    the bars start above 0 so the gap is easy to see.
    Missing = a dashed empty block on top of the actual bar (what should be there but isn't).
    Extra = a solid amber block above the expected line (more than expected was found).
    Drawing only: every quantity comes from the server.
*/
export function GapChart3D({ expected, actual }) {
  const W = 340;
  const H = 214;
  const base = 158;
  const top = 40;
  const barW = 84;
  const d = 10; // depth of the 3D blocks
  const x3 = 22;
  const x4 = 140;

  const gap = Math.abs(actual - expected);
  const isShort = actual < expected;
  const isOver = actual > expected;
  const high = Math.max(expected, actual, 1);
  const low = Math.min(expected, actual);
  const axisMin =
    gap > 0 && gap < high * 0.25 ? Math.max(low - gap * 2.2, 0) : 0;
  const zoomed = axisMin > 0;
  const y = (v) =>
    base - ((v - axisMin) / (high - axisMin || 1)) * (base - top);

  // one 3D block between two values
  const block = (key, x, vHi, vLo, { cls, ghost = false, topFace = true }) => {
    const yT = y(vHi);
    const h = Math.max(y(vLo) - yT, 2);
    const ghostProps = ghost
      ? { strokeDasharray: "4 3", strokeWidth: 1.5 }
      : {};
    return (
      <g key={key}>
        <rect
          x={x}
          y={yT}
          width={barW}
          height={h}
          className={cls}
          {...ghostProps}
        />
        {topFace && (
          <polygon
            points={`${x},${yT} ${x + d},${yT - d * 0.6} ${x + barW + d},${yT - d * 0.6} ${x + barW},${yT}`}
            className={cls}
            style={ghost ? undefined : { filter: "brightness(1.25)" }}
            {...ghostProps}
          />
        )}
        <polygon
          points={`${x + barW},${yT} ${x + barW + d},${yT - d * 0.6} ${x + barW + d},${yT + h - d * 0.6} ${x + barW},${yT + h}`}
          className={cls}
          style={ghost ? undefined : { filter: "brightness(0.7)" }}
          {...ghostProps}
        />
      </g>
    );
  };

  // number inside the bar when there is room, above it when the bar is very short
  const valueLabel = (x, v, yTopOfBar) => {
    const room = y(axisMin) - yTopOfBar;
    const inside = room >= 30;
    return (
      <text
        x={x + barW / 2 + d / 2}
        y={inside ? yTopOfBar + 20 : yTopOfBar - d * 0.6 - 6}
        textAnchor="middle"
        className={cn(
          "text-[13px] font-bold",
          inside ? "fill-white" : "fill-foreground",
        )}
      >
        {fmtQty(v)}
      </text>
    );
  };

  const stockTop = Math.min(actual, expected); // the solid part of the "actual" bar
  const capFill = isShort
    ? "fill-destructive/10 stroke-destructive"
    : "fill-warning";
  const capColor = isShort ? "fill-destructive" : "fill-warning";
  const tx = x4 + barW + d + 12;
  const capMid =
    (y(Math.max(actual, expected)) + y(Math.min(actual, expected))) / 2;
  const cx3 = x3 + barW / 2 + d / 2;
  const cx4 = x4 + barW / 2 + d / 2;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mx-auto block w-full max-w-md overflow-visible"
        role="img"
        aria-label={`Should be in stock ${fmtQty(expected)}, actually in stock ${fmtQty(actual)}${gap ? `, ${fmtQty(gap)} ${isShort ? "missing" : "extra"}` : ", nothing missing"}`}
      >
        <line
          x1={x3 - 10}
          x2={x4 + barW + d + 10}
          y1={base}
          y2={base}
          className="stroke-border"
          strokeWidth={1.5}
        />

        <motion.g
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.45, ease: "easeOut" }}
        >
          {block("b3", x3, expected, axisMin, { cls: "fill-cf-blue" })}
          {valueLabel(x3, expected, y(expected))}
        </motion.g>

        <motion.g
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.45, ease: "easeOut" }}
        >
          {block("b4", x4, stockTop, axisMin, {
            cls: "fill-primary",
            topFace: !(isShort || isOver),
          })}
          {valueLabel(x4, actual, y(stockTop))}
        </motion.g>

        {gap > 0 && (
          <motion.g
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55, duration: 0.45, ease: "easeOut" }}
          >
            {block("cap", x4, Math.max(actual, expected), stockTop, {
              cls: capFill,
              ghost: isShort,
            })}
            {/* the expected level, carried across from the "should be" bar */}
            <line
              x1={x3 + barW + d}
              x2={x4 + barW}
              y1={y(expected) - d * 0.6}
              y2={y(expected) - d * 0.6}
              className="stroke-muted-foreground/60"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <circle cx={tx + 8} cy={capMid - 6} r={8} className={capColor} />
            <text
              x={tx + 8}
              y={capMid - 6}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-white text-[10px] font-bold"
            >
              5
            </text>
            <text
              x={tx + 22}
              y={capMid - 2}
              className={cn(
                "text-[15px] font-bold",
                isShort ? "fill-destructive" : "fill-warning",
              )}
            >
              {isShort ? "−" : "+"}
              {fmtQty(gap)}
            </text>
            <text
              x={tx + 22}
              y={capMid + 12}
              className="fill-muted-foreground text-[10px] font-medium"
            >
              {isShort ? "Missing" : "Extra"}
            </text>
          </motion.g>
        )}

        <circle cx={cx3} cy={base + 17} r={7.5} className="fill-cf-blue" />
        <text
          x={cx3}
          y={base + 17}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-white text-[10px] font-bold"
        >
          3
        </text>
        <text
          x={cx3}
          y={base + 38}
          textAnchor="middle"
          className="fill-muted-foreground text-[10px] font-medium"
        >
          Should be in stock
        </text>
        <circle cx={cx4} cy={base + 17} r={7.5} className="fill-primary" />
        <text
          x={cx4}
          y={base + 17}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-white text-[10px] font-bold"
        >
          4
        </text>
        <text
          x={cx4}
          y={base + 38}
          textAnchor="middle"
          className="fill-muted-foreground text-[10px] font-medium"
        >
          Actually in stock
        </text>
      </svg>
      {zoomed && (
        <p className="mt-1 text-center text-[11px] text-muted-foreground">
          Zoomed in: the bars don't start at 0, so the gap is easy to see.
        </p>
      )}
    </div>
  );
}
