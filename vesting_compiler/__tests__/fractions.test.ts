import { fracAdd, fracMul, fracReduce, fracSub } from "../fractions";

describe("fracReduce", () => {
  it("reduces 50/100 to 1/2", () => {
    expect(fracReduce({ numerator: 50, denominator: 100 })).toEqual({
      numerator: 1,
      denominator: 2,
    });
  });

  it("leaves an already-reduced fraction alone", () => {
    expect(fracReduce({ numerator: 3, denominator: 7 })).toEqual({
      numerator: 3,
      denominator: 7,
    });
  });

  it("reduces zero numerator to 0/1", () => {
    expect(fracReduce({ numerator: 0, denominator: 48 })).toEqual({
      numerator: 0,
      denominator: 1,
    });
  });
});

describe("fracAdd", () => {
  it("adds 1/4 + 1/48 = 13/48", () => {
    expect(fracAdd({ numerator: 1, denominator: 4 }, { numerator: 1, denominator: 48 })).toEqual({
      numerator: 13,
      denominator: 48,
    });
  });

  it("adds two halves to one", () => {
    expect(fracAdd({ numerator: 1, denominator: 2 }, { numerator: 1, denominator: 2 })).toEqual({
      numerator: 1,
      denominator: 1,
    });
  });
});

describe("fracSub", () => {
  it("computes 1 - 1/4 = 3/4", () => {
    expect(fracSub({ numerator: 1, denominator: 1 }, { numerator: 1, denominator: 4 })).toEqual({
      numerator: 3,
      denominator: 4,
    });
  });
});

describe("fracMul", () => {
  it("multiplies 3/10 by 1/1", () => {
    expect(fracMul({ numerator: 3, denominator: 10 }, { numerator: 1, denominator: 1 })).toEqual({
      numerator: 3,
      denominator: 10,
    });
  });

  it("multiplies 3/4 by 1/36 = 1/48", () => {
    expect(fracMul({ numerator: 3, denominator: 4 }, { numerator: 1, denominator: 36 })).toEqual({
      numerator: 1,
      denominator: 48,
    });
  });
});

