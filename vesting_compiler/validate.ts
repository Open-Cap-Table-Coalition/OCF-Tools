import type {
  Cliff,
  Fraction,
  PeriodType,
  VestingScheduleTemplate,
  VestingStatement,
} from "../types/canonical/vesting";
import type { VestingRuntime } from "./compile";
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

const validateVestingBase = (
  base: VestingStatement["vesting_base"],
  path: string,
  errors: ValidationError[],
): void => {
  if (!base || typeof base !== "object") {
    errors.push({ path, message: "is required and must be an object" });
    return;
  }
  if (base.type !== "DATE" && base.type !== "EVENT") {
    errors.push({
      path: `${path}.type`,
      message: 'must be "DATE" or "EVENT"',
    });
    return;
  }
  if (base.type === "EVENT") {
    if (typeof base.event_id !== "string" || base.event_id.length === 0) {
      errors.push({
        path: `${path}.event_id`,
        message: "must be a non-empty string",
      });
    }
  } else {
    // DATE — no extra fields permitted; specifically, stray event_id is wrong.
    if ("event_id" in base) {
      errors.push({
        path: `${path}.event_id`,
        message: 'must not be present on a vesting_base with type "DATE"',
      });
    }
  }
};

const validateStatement = (
  s: VestingStatement,
  path: string,
  errors: ValidationError[],
): void => {
  if (!isPositiveInt(s.order)) {
    errors.push({ path: `${path}.order`, message: "must be an integer >= 1" });
  }
  validateVestingBase(s.vesting_base, `${path}.vesting_base`, errors);
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
 * checks the spec's well-formedness, not runtime inputs.
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

const fractionInUnitInterval = (f: Fraction): boolean => {
  // Valid fractions reach this point (denominator >= 1).
  if (f.numerator < 0) return false;
  // numerator/denominator <= 1 ⇔ numerator <= denominator
  return f.numerator <= f.denominator;
};

/**
 * Validates the per-grant runtime data passed to compileVesting against the
 * template. Catches mismatches that the static template validator cannot:
 *   - startDate required when any DATE-anchored statement exists
 *   - eventFirings must reference event_ids that exist on EVENT statements
 *   - no duplicate event_id in eventFirings (single firing per event_id)
 *   - dates must be ISO format
 *   - realized_fraction (if present) must be a valid Fraction in [0, 1]
 */
export const validateVestingRuntime = (
  runtime: VestingRuntime,
  template: VestingScheduleTemplate,
): ValidationResult => {
  const errors: ValidationError[] = [];

  const dateAnchoredExists = Array.isArray(template.statements)
    ? template.statements.some((s) => s?.vesting_base?.type === "DATE")
    : false;

  if (dateAnchoredExists) {
    if (typeof runtime.startDate !== "string") {
      errors.push({
        path: "startDate",
        message:
          "is required when the template contains any DATE-anchored statement",
      });
    } else if (!ISO_DATE_PATTERN.test(runtime.startDate)) {
      errors.push({
        path: "startDate",
        message: "must be an ISO 8601 date string (YYYY-MM-DD)",
      });
    }
  } else if (
    runtime.startDate !== undefined &&
    !ISO_DATE_PATTERN.test(runtime.startDate)
  ) {
    // Tolerated but format-checked.
    errors.push({
      path: "startDate",
      message: "must be an ISO 8601 date string (YYYY-MM-DD)",
    });
  }

  if (runtime.grantDate !== undefined) {
    if (
      typeof runtime.grantDate !== "string" ||
      !ISO_DATE_PATTERN.test(runtime.grantDate)
    ) {
      errors.push({
        path: "grantDate",
        message: "must be an ISO 8601 date string (YYYY-MM-DD)",
      });
    }
  }

  if (runtime.eventFirings !== undefined) {
    if (!Array.isArray(runtime.eventFirings)) {
      errors.push({ path: "eventFirings", message: "must be an array" });
    } else {
      const templateEventIds = new Set(
        (template.statements ?? [])
          .filter((s) => s?.vesting_base?.type === "EVENT")
          .map((s) => (s.vesting_base as { event_id: string }).event_id),
      );
      const seen = new Map<string, number[]>();

      runtime.eventFirings.forEach((firing, i) => {
        const path = `eventFirings[${i}]`;
        if (typeof firing?.event_id !== "string" || firing.event_id.length === 0) {
          errors.push({
            path: `${path}.event_id`,
            message: "must be a non-empty string",
          });
        } else {
          const indices = seen.get(firing.event_id) ?? [];
          indices.push(i);
          seen.set(firing.event_id, indices);
          if (!templateEventIds.has(firing.event_id)) {
            errors.push({
              path: `${path}.event_id`,
              message: `"${firing.event_id}" does not match any EVENT-anchored statement in the template`,
            });
          }
        }
        if (
          typeof firing?.date !== "string" ||
          !ISO_DATE_PATTERN.test(firing.date)
        ) {
          errors.push({
            path: `${path}.date`,
            message: "must be an ISO 8601 date string (YYYY-MM-DD)",
          });
        }
        if (firing?.realized_fraction !== undefined) {
          validateFraction(
            firing.realized_fraction,
            `${path}.realized_fraction`,
            errors,
          );
          // Only check interval bounds if the fraction itself parsed OK.
          if (
            isInteger(firing.realized_fraction.numerator) &&
            isPositiveInt(firing.realized_fraction.denominator) &&
            !fractionInUnitInterval(firing.realized_fraction)
          ) {
            errors.push({
              path: `${path}.realized_fraction`,
              message: "must be in the closed interval [0, 1]",
            });
          }
        }
      });

      for (const [eventId, indices] of seen) {
        if (indices.length > 1) {
          errors.push({
            path: "eventFirings",
            message: `duplicate event_id "${eventId}" at indices [${indices.join(", ")}]`,
          });
        }
      }
    }
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
export const assertValidVestingRuntime = (
  runtime: VestingRuntime,
  template: VestingScheduleTemplate,
): void => {
  const result = validateVestingRuntime(runtime, template);
  if (!result.valid) {
    throw new Error(
      `Invalid VestingRuntime:\n${formatErrors(result.errors)}`,
    );
  }
};
