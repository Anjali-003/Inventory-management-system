// Whole-number helpers for quantity inputs. Inputs stay as strings while typing
// (Number("") is 0, which would wrongly look like a valid quantity).

export const isPositiveInteger = (value) => {
  const text = String(value ?? "").trim()
  return /^\d+$/.test(text) && Number.isSafeInteger(Number(text)) && Number(text) > 0
}

export const toInt = (value) => Number.parseInt(String(value), 10)
