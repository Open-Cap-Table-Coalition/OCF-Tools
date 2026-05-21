import type {
  Cliff,
  Fraction,
  PeriodType,
  VestingSchedule,
  VestingScheduleTemplate,
  VestingStatement,
} from "../types/canonical/vesting";
import { ISO_DATE_PATTERN } from "./dates";

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

const PERIOD_TYPES: ReadonlyArray<PeriodType> = ["DAYS", "MONTHS", "YEARS"];

const isInteger = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n);

const isPositiveInt = (n: unknown): n is number => isInteger(n) && n > 0;

const isNonNegativeInt = (n: unknown): n is number => isInteger(n) && n >= 0;

const validateFraction = (
  f: Fraction,
  path: string,
  errors: ValidationError[],
): void => {
  if (!isInteger(f.numerator)) {
    errors.push({ path: `${path}.numerator`, message: "must be an integer" });
  }
  if (!isPositiveInt(f.denominator)) {
    errors.push({
      path: `${path}.denominator`,
      message: "must be an integer >= 1",
    });
  }
};

const validateCliff = (
  c: Cliff,
  occurrences: number,
  path: string,
  errors: ValidationError[],
): void => {
  if (!isPositiveInt(c.occurrence)) {
    errors.push({
      path: `${path}.occurrence`,
      message: "must be an integer >= 1",
    });
  } else if (isPositiveInt(occurrences) && c.occurrence > occurrences) {
    errors.push({
      path: `${path}.occurrence`,
      message: `must be <= statement.occurrences (got ${c.occurrence}, occurrences=${occurrences})`,
    });
  }
  validateFraction(c.percentage, `${path}.percentage`, errors);
};

const validateStatement = (
  s: VestingStatement,
  path: string,
  errors: ValidationError[],
): void => {
  if (!isPositiveInt(s.order)) {
    errors.push({ path: `${path}.order`, message: "must be an integer >= 1" });
  }
  if (!isPositiveInt(s.occurrences)) {
    errors.push({
      path: `${path}.occurrences`,
      message: "must be an integer >= 1",
    });
  }
  if (!isNonNegativeInt(s.period)) {
    errors.push({
      path: `${path}.period`,
      message: "must be an integer >= 0",
    });
  }
  if (!PERIOD_TYPES.includes(s.period_type)) {
    errors.push({
      path: `${path}.period_type`,
      message: `must be one of ${PERIOD_TYPES.join(", ")}`,
    });
  }
  validateFraction(s.percentage, `${path}.percentage`, errors);
  if (s.cliff) {
    validateCliff(s.cliff, s.occurrences, `${path}.cliff`, errors);
  }
};

/**
 * Structural validation for a canonical VestingScheduleTemplate. Returns a
 * { valid, errors[] } result that consumers (the compiler, the OCF validator)
 * can use to either bail or map into their own report shape. Schema-only:
 * checks the spec's well-formedness, not compile-time inputs like totalShares.
 */
export const validateVestingScheduleTemplate = (
  t: VestingScheduleTemplate,
): ValidationResult => {
  const errors: ValidationError[] = [];

  if (typeof t.id !== "string" || t.id.length === 0) {
    errors.push({ path: "id", message: "must be a non-empty string" });
  }

  if (!Array.isArray(t.statements) || t.statements.length === 0) {
    errors.push({ path: "statements", message: "must be a non-empty array" });
  } else {
    t.statements.forEach((s, i) => {
      validateStatement(s, `statements[${i}]`, errors);
    });

    const ordersSeen = new Map<number, number[]>();
    t.statements.forEach((s, i) => {
      if (isPositiveInt(s.order)) {
        const indices = ordersSeen.get(s.order) ?? [];
        indices.push(i);
        ordersSeen.set(s.order, indices);
      }
    });
    for (const [order, indices] of ordersSeen) {
      if (indices.length > 1) {
        errors.push({
          path: "statements",
          message: `duplicate order ${order} at indices [${indices.join(", ")}]`,
        });
      }
    }
  }

  return { valid: errors.length === 0, errors };
};

/**
 * Structural validation for a canonical VestingSchedule. Returns a
 * { valid, errors[] } result. Does NOT verify that template_id resolves to an
 * existing template — that's a cross-reference check belonging to the consumer.
 */
export const validateVestingSchedule = (
  s: VestingSchedule,
): ValidationResult => {
  const errors: ValidationError[] = [];

  if (typeof s.template_id !== "string" || s.template_id.length === 0) {
    errors.push({ path: "template_id", message: "must be a non-empty string" });
  }

  if (
    typeof s.start_date !== "string" ||
    !ISO_DATE_PATTERN.test(s.start_date)
  ) {
    errors.push({
      path: "start_date",
      message: "must be an ISO 8601 date string (YYYY-MM-DD)",
    });
  }

  return { valid: errors.length === 0, errors };
};

const formatErrors = (errors: ValidationError[]): string =>
  errors.map((e) => `  - ${e.path}: ${e.message}`).join("\n");

/** Throws a single Error with all validation messages on invalid input. */
export const assertValidVestingScheduleTemplate = (
  t: VestingScheduleTemplate,
): void => {
  const result = validateVestingScheduleTemplate(t);
  if (!result.valid) {
    throw new Error(
      `Invalid VestingScheduleTemplate:\n${formatErrors(result.errors)}`,
    );
  }
};

/** Throws a single Error with all validation messages on invalid input. */
export const assertValidVestingSchedule = (s: VestingSchedule): void => {
  const result = validateVestingSchedule(s);
  if (!result.valid) {
    throw new Error(`Invalid VestingSchedule:\n${formatErrors(result.errors)}`);
  }
};
