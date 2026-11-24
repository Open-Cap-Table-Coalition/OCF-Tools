// OCF share quantities are decimal strings with up to ten fractional digits. Convert them to integer
// ten-billionths so arithmetic stays exact for large and fractional share counts.

/** Accepted format for an OCF decimal string. */
const NUMERIC = /^[+-]?[0-9]+(\.[0-9]{1,10})?$/;

/** OCF supports ten fractional digits. */
const PLACES = 10;
const SCALE = 10n ** BigInt(PLACES);

/** Check values from disk before doing arithmetic. */
export const isNumeric = (value: unknown): value is string => typeof value === "string" && NUMERIC.test(value);

/** Convert a validated decimal string to integer ten-billionths. */
const toScaled = (value: string): bigint => {
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace(/^[+-]/, "").split(".");
  const scaled = BigInt(whole) * SCALE + BigInt(fraction.padEnd(PLACES, "0"));
  return negative ? -scaled : scaled;
};

/** Convert back to a decimal string, trimming trailing fractional zeros and the sign on zero. */
const fromScaled = (scaled: bigint): string => {
  const magnitude = scaled < 0n ? -scaled : scaled;
  const whole = magnitude / SCALE;
  const fraction = (magnitude % SCALE).toString().padStart(PLACES, "0").replace(/0+$/, "");
  return `${scaled < 0n ? "-" : ""}${whole}${fraction === "" ? "" : `.${fraction}`}`;
};

/** Add two OCF quantities exactly. */
export const add = (a: string, b: string): string => fromScaled(toScaled(a) + toScaled(b));

/** Subtract the second OCF quantity from the first. */
export const subtract = (a: string, b: string): string => fromScaled(toScaled(a) - toScaled(b));

/** Compare two quantities at OCF precision. */
export const exceeds = (a: string, b: string): boolean => toScaled(a) > toScaled(b);

/** Check the sign of a validated quantity. */
export const isNegative = (value: string): boolean => toScaled(value) < 0n;

/** Validate quantities before adding them to a pool or a return allowance. */
export const isQuantity = (value: unknown): value is string => isNumeric(value) && !isNegative(value);

/**
 * Check that the parts add up to the whole. Decimal strings add exactly. Any other value is read as a
 * float, as the stock checks did before.
 */
export const addsUpTo = (parts: readonly unknown[], whole: unknown): boolean => {
  if (isNumeric(whole) && parts.every(isNumeric)) return subtract(parts.reduce(add, "0"), whole) === "0";
  return parts.reduce((sum: number, part) => sum + parseFloat(part as string), 0) === parseFloat(whole as string);
};
