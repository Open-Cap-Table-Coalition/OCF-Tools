import type { Fraction } from "../types/canonical/vesting";

const gcd = (a: number, b: number): number => {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    [x, y] = [y, x % y];
  }
  return x || 1;
};

export const fracReduce = (f: Fraction): Fraction => {
  const d = gcd(f.numerator, f.denominator);
  return { numerator: f.numerator / d, denominator: f.denominator / d };
};

export const fracMul = (a: Fraction, b: Fraction): Fraction =>
  fracReduce({
    numerator: a.numerator * b.numerator,
    denominator: a.denominator * b.denominator,
  });

export const fracAdd = (a: Fraction, b: Fraction): Fraction =>
  fracReduce({
    numerator: a.numerator * b.denominator + b.numerator * a.denominator,
    denominator: a.denominator * b.denominator,
  });

export const fracSub = (a: Fraction, b: Fraction): Fraction =>
  fracReduce({
    numerator: a.numerator * b.denominator - b.numerator * a.denominator,
    denominator: a.denominator * b.denominator,
  });

export const ZERO: Fraction = { numerator: 0, denominator: 1 };
export const ONE: Fraction = { numerator: 1, denominator: 1 };
