export const n = (v) => Number(v || 0);

export const whole = (v) =>
  /^\d+$/.test(String(v ?? "").trim()) &&
  Number.isSafeInteger(Number(v)) &&
  Number(v) > 0;
