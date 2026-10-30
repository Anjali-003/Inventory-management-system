import { fmtQty } from "@/lib/stock";

export const TEXT = {
  success: "text-success",
  danger: "text-destructive",
  warning: "text-warning",
};

export function balanceStatus(diff) {
  if (diff === 0)
    return {
      tone: "success",
      pill: "Balanced",
      short: "Matches expected",
      text: "Stock on hand matches the records.",
    };
  if (diff < 0) {
    return {
      tone: "danger",
      pill: "Short",
      short: "Short of expected",
      text: `${fmtQty(Math.abs(diff))} components are missing from stock. The Shortfall tab shows where they went.`,
    };
  }
  return {
    tone: "warning",
    pill: "Over",
    short: "More than expected",
    text: `${fmtQty(diff)} more components are on hand than the records show. Check BOM quantities and stock-in entries.`,
  };
}

export const BG = {
  success: "bg-gradient-to-br from-emerald-50 via-emerald-50/80 to-white",
  danger: "bg-gradient-to-br from-rose-50 via-red-50/80 to-white",
  warning: "bg-gradient-to-br from-amber-50 via-orange-50/70 to-white",
};

export const CHIP = {
  success: "bg-emerald-100 text-emerald-800",
  danger: "bg-rose-100 text-rose-800",
  warning: "bg-amber-100 text-amber-800",
};

export const TONE_TEXT = {
  success: "text-success",
  danger: "text-destructive",
  warning: "text-warning",
  info: "text-primary",
  neutral: "text-foreground",
};
