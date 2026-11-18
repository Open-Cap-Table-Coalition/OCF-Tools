// ---------------------------------------------------------------------------
// OCF Numeric arithmetic
// ---------------------------------------------------------------------------
//
// OCF writes a quantity as a Numeric: a fixed-point decimal in a string, with
// up to ten decimal places ("1000", "0.5", "12.0000000001"). The aggregates
// add and compare these, and a cap table's share counts have to come out
// exact, so nothing here goes through a JavaScript number. A Numeric is read
// into a BigInt count of ten-billionths, and the arithmetic is done on that.

/** The schema's pattern for a Numeric. */
const NUMERIC = /^[+-]?[0-9]+(\.[0-9]{1,10})?$/;

/** How many decimal places a Numeric can carry. */
const PLACES = 10;
const SCALE = 10n ** BigInt(PLACES);

/** Whether a package value is an OCF Numeric. Nothing checks a package against the schema first, so it may not be. */
export const isNumeric = (value: unknown): value is string => typeof value === "string" && NUMERIC.test(value);

/** A Numeric as a count of ten-billionths. The value must be one (see `isNumeric`). */
const toScaled = (value: string): bigint => {
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace(/^[+-]/, "").split(".");
  const scaled = BigInt(whole) * SCALE + BigInt(fraction.padEnd(PLACES, "0"));
  return negative ? -scaled : scaled;
};

/** A count of ten-billionths as a Numeric, with no sign on zero and no trailing zeros. */
const fromScaled = (scaled: bigint): string => {
  const magnitude = scaled < 0n ? -scaled : scaled;
  const whole = magnitude / SCALE;
  const fraction = (magnitude % SCALE).toString().padStart(PLACES, "0").replace(/0+$/, "");
  return `${scaled < 0n ? "-" : ""}${whole}${fraction === "" ? "" : `.${fraction}`}`;
};

/** The sum of two Numerics, exactly. */
export const add = (a: string, b: string): string => fromScaled(toScaled(a) + toScaled(b));

/** The first Numeric less the second, exactly. */
export const subtract = (a: string, b: string): string => fromScaled(toScaled(a) - toScaled(b));

/** Whether the first Numeric is greater than the second. */
export const exceeds = (a: string, b: string): boolean => toScaled(a) > toScaled(b);

/** Whether a Numeric is below zero. */
export const isNegative = (value: string): boolean => toScaled(value) < 0n;
