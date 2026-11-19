import type { OCFStockIssuance } from "@opencaptablecoalition/ocf-types";
import type { OcfTransaction, TransactionFor } from "../../types/ocf-input";
import type { DeepReadonly } from "../../types/validator";
import { securityField } from "../nodes";
import { isNegative, isNumeric } from "../numeric";
import type { CollectionElement, CollectionKey, TxKey } from "../ocfMachine";
import { text, type CheckContext, type CheckObject } from "./checkKit";

/**
 * Match the seven older plan security names to their equity compensation equivalents. Repricing has
 * only its current name.
 */
export const OLDER_NAMES = {
  TX_PLAN_SECURITY_ISSUANCE: "TX_EQUITY_COMPENSATION_ISSUANCE",
  TX_PLAN_SECURITY_ACCEPTANCE: "TX_EQUITY_COMPENSATION_ACCEPTANCE",
  TX_PLAN_SECURITY_EXERCISE: "TX_EQUITY_COMPENSATION_EXERCISE",
  TX_PLAN_SECURITY_RELEASE: "TX_EQUITY_COMPENSATION_RELEASE",
  TX_PLAN_SECURITY_RETRACTION: "TX_EQUITY_COMPENSATION_RETRACTION",
  TX_PLAN_SECURITY_CANCELLATION: "TX_EQUITY_COMPENSATION_CANCELLATION",
  TX_PLAN_SECURITY_TRANSFER: "TX_EQUITY_COMPENSATION_TRANSFER",
} as const satisfies Partial<Record<TxKey, TxKey>>;

/** Convert a known older transaction name to its current name. Preserve other input values. */
export const currentName = (type: unknown): unknown =>
  typeof type === "string" && Object.hasOwn(OLDER_NAMES, type) ? OLDER_NAMES[type as keyof typeof OLDER_NAMES] : type;

/** Include older names when checking the type of a transaction in the package history. */
export const isOfType = <K extends TxKey>(
  ele: DeepReadonly<OcfTransaction>,
  type: K,
): ele is Extract<DeepReadonly<OcfTransaction>, DeepReadonly<TransactionFor<K>>> => currentName(ele.object_type) === type;

/**
 * The stakeholder named by the transaction's `stakeholder_id` is in the
 * package's stakeholder file. Every family's issuance validator uses this.
 */
export const stakeholderExists = {
  id: "stakeholder-exists",
  severity: "error",
  description:
    "The stakeholder referenced by the transaction exists in the stakeholder file.",
  run: (context, data) => {
    const messages: string[] = [];
    const { stakeholders } = context.ocfPackageContent;

    // The package reader doesn't give stakeholders a type, so this states the
    // one field the check uses.
    let stakeholderExists = false;
    stakeholders.forEach((ele: { id: string }) => {
      if (ele.id === data.stakeholder_id) stakeholderExists = true;
    });
    if (!stakeholderExists) {
      messages.push(
        text`The stakeholder ${data.stakeholder_id} referenced by the transaction was not found in the stakeholder file.`,
      );
    }

    return messages;
  },
} satisfies CheckObject<{ stakeholder_id: string }>;

/**
 * Check for a nonnegative OCF quantity before changing a pool. The optional condition limits the
 * check to transactions that affect a plan.
 */
export const countable = <F extends string>(field: F, applies: (data: any) => boolean = () => true) =>
  ({
    id: `${field.replace(/_/g, "-")}-countable`,
    severity: "error",
    description: `The transaction's ${field} is a number, and not negative, so it can be counted against the stock plan's pool.`,
    run: (_context, data) => {
      if (!applies(data)) return [];
      const value = (data as Record<string, unknown>)[field];
      if (!isNumeric(value)) return [text`The transaction's ${field} (${value}) is not a number written the way OCF writes one.`];
      return isNegative(value) ? [text`The transaction's ${field} (${value}) is negative.`] : [];
    },
  }) satisfies CheckObject<Record<F, string>>;

/**
 * Check whether the removal index lists an earlier date. That index includes attempts, so an
 * uncertain lifecycle blocks the check. Allow same-day removal and vesting (#214). A return to pool
 * has its own check for prior removal.
 */
export const noEarlierRemoval = {
  id: "no-earlier-removal",
  severity: "error",
  description: "No transaction dated before this one removed its security from the cap table.",
  // A failed removal can appear in the index. Check the lifecycle field in every family so an
  // earlier failure on the record can block this check.
  reads: (data) => (["stockIssuances", "convertibleIssuances", "warrantIssuances", "equityCompensation"] as const)
    .map((family) => securityField(family, data.security_id, "lifecycle")),
  run: (context, data) => {
    const removal = context.removals.get(data.security_id);
    if (removal === undefined || !(removal.date < data.date)) return [];
    return [
      text`The security ${data.security_id} was removed from the cap table by ${removal.id} on ${removal.date}.`,
    ];
  },
} satisfies CheckObject<{ security_id: string; date: string }>;

/**
 * Describe each family's issuance, acceptance, vesting, stock plan support and transactions that
 * keep it outstanding. The shared checks use these settings to apply the same rule to matching
 * payloads under either transaction name.
 */
type Family = {
  [C in CollectionKey]: {
    name: string;
    collection: C;
    issuance: CollectionElement[C]["object_type"];
    acceptance: Extract<TxKey, `TX_${string}_ACCEPTANCE`>;
    vests: HasKey<CollectionElement[C], "vesting_terms_id" | "vesting_template_id">;
    returnsToPool: HasKey<CollectionElement[C], "stock_plan_id">;
    leavesOutstanding?: readonly TxKey[];
  };
}[CollectionKey];

/**
 * Whether some member of `T` has one of the keys `K`. An issuance type can be a
 * union of schema versions (equity compensation's v1 | v2), and `keyof` on a
 * union keeps only the keys every member shares.
 */
type HasKey<T, K extends PropertyKey> =
  [Extract<K, T extends unknown ? keyof T : never>] extends [never] ? false : true;

/**
 * The transactions that record a security's vesting. None of them transfers,
 * converts, or retires the security.
 */
const VESTING_TRANSACTIONS = [
  "TX_VESTING_START",
  "TX_VESTING_EVENT",
  "TX_VESTING_ACCELERATION",
] as const satisfies readonly TxKey[];

/**
 * The transaction that records which stock plan's pool a security's shares
 * went back to when it was cancelled. It names the cancelled security.
 */
const RETURN_TO_POOL = "TX_STOCK_PLAN_RETURN_TO_POOL" satisfies TxKey;

/** Joins words as "x", "x or y", or "x, y, or z"; `separator` replaces the commas in the last form. */
const anyOf = (items: readonly string[], separator = ", "): string =>
  items.length <= 2
    ? items.join(" or ")
    : `${items.slice(0, -1).join(separator)}${separator}or ${items[items.length - 1]}`;

/**
 * Builds the checks every security family uses the same way, worded for the
 * given family. Each family's `checks.ts` calls this once, and that family's
 * validators import the checks from there.
 */
export function familyChecksFor({
  name,
  collection,
  issuance,
  acceptance,
  vests,
  returnsToPool,
  leavesOutstanding = [],
}: Family) {
  /**
   * Read this family's lifecycle to check that the security is outstanding. An unreliable lifecycle
   * blocks the check. If the security is missing, use the package history and transaction date to
   * explain why.
   */
  const issuanceExists = {
    id: "issuance-exists",
    severity: "error",
    description: `The ${name} issuance referenced by the transaction's security_id is outstanding as of the transaction's date.`,
    reads: (data) => [securityField(collection, data.security_id, "lifecycle")],
    run: (context, data, read) => {
      const messages: string[] = [];

      // OCF requires a date on every transaction, but nothing checks that
      // before the validators run, and a live match below doesn't look at
      // dates. Without this, an undated transaction would pass.
      if (typeof data.date !== "string") {
        messages.push(
          text`The transaction has no date, so it can't be checked against the ${name} issuance with security_id ${data.security_id}.`,
        );
        return messages;
      }

      if (read(securityField(collection, data.security_id, "lifecycle")) === "outstanding") return messages;

      // Check the transaction type before accessing fields specific to an issuance.
      const { transactions } = context.ocfPackageContent;
      let firstIssuanceDate: string | undefined;
      let onOrBeforeDate: string | undefined;
      transactions.forEach((ele) => {
        if (isOfType(ele, issuance) && ele.security_id === data.security_id) {
          if (firstIssuanceDate === undefined) firstIssuanceDate = ele.date;
          if (onOrBeforeDate === undefined && ele.date <= data.date) {
            onOrBeforeDate = ele.date;
          }
        }
      });

      if (firstIssuanceDate === undefined) {
        messages.push(
          text`No ${name} issuance with security_id ${data.security_id} appears in the package.`,
        );
      } else if (onOrBeforeDate === undefined) {
        messages.push(
          text`The ${name} issuance referenced by security_id ${data.security_id} is dated ${firstIssuanceDate}, after this transaction (${data.date}).`,
        );
      } else {
        messages.push(
          text`The ${name} issuance referenced by security_id ${data.security_id} (dated ${onOrBeforeDate}) is not outstanding as of this transaction's date.`,
        );
      }

      return messages;
    },
  } satisfies CheckObject<{ security_id: string; date: string }>;

  // The family's name with its article: "a warrant", "an equity compensation".
  const aName = `${/^[aeiou]/.test(name) ? "an" : "a"} ${name}`;

  // The family's own transactions that no-other-transactions exempts, as
  // words: "issuance", "acceptance", then each type in leavesOutstanding without the
  // family's prefix ("TX_EQUITY_COMPENSATION_EXERCISE" is "exercise").
  const prefix = acceptance.slice(0, -"ACCEPTANCE".length);
  const ownExempt = [
    "issuance",
    "acceptance",
    ...leavesOutstanding.map((type) => type.slice(prefix.length).toLowerCase().replace(/_/g, " ")),
  ];

  // What no-other-transactions' description says the scan exempts. The groups
  // are separated by semicolons once there are three, since each group has
  // commas of its own.
  const exempt = anyOf(
    [
      `${aName} ${anyOf(ownExempt)}`,
      ...(vests ? ["a vesting start, event, or acceleration"] : []),
      ...(returnsToPool ? ["a return to pool"] : []),
    ],
    "; ",
  );

  /**
   * Nothing dated on or before this transaction refers to this security except
   * its issuance, acceptances, and the transaction being validated, plus,
   * depending on the family, its vesting transactions, the family's
   * transactions that leave it outstanding, and its return to a stock plan's
   * pool. A later transaction can't make this one invalid. The cancellation
   * and conversion validators and the warrant exercise run this check; the
   * transfer validators and the equity compensation exercise only declare it,
   * as a gap (see `asGap`).
   */
  const noOtherTransactions = {
    id: "no-other-transactions",
    severity: "error",
    description: `No other transaction dated on or before this transaction references its security_id, other than ${exempt}.`,
    run: (context, data) => {
      const messages: string[] = [];
      const { transactions } = context.ocfPackageContent;

      // Report each earlier or same-day transaction that conflicts with this one. Use both object
      // type and ID to exclude the transaction itself. Apply family exemptions under current and
      // older names, including vesting where the family supports it.
      transactions.forEach((ele) => {
        if (
          "security_id" in ele &&
          ele.security_id === data.security_id &&
          ele.date <= data.date &&
          currentName(ele.object_type) !== issuance &&
          currentName(ele.object_type) !== acceptance &&
          !(vests && (VESTING_TRANSACTIONS as readonly string[]).includes(ele.object_type)) &&
          !(leavesOutstanding as readonly unknown[]).includes(currentName(ele.object_type)) &&
          !(returnsToPool && ele.object_type === RETURN_TO_POOL) &&
          !(ele.object_type === data.object_type && ele.id === data.id)
        ) {
          messages.push(
            text`Another transaction (${ele.id}) references the transaction's security_id.`,
          );
        }
      });

      return messages;
    },
  } satisfies CheckObject<{ object_type: string; id: string; security_id: string; date: string }>;

  return { issuanceExists, noOtherTransactions };
}

// resulting_security_ids comes straight from the package file, and nothing
// checks its shape first. The resulting checks read it through this helper so a
// value that isn't a list can't crash the run: resulting-stock-exists reports
// it, and the other resulting checks pass over it.
const resultingIds = (
  data: DeepReadonly<{ resulting_security_ids: string[] }>,
): readonly string[] | undefined =>
  Array.isArray(data.resulting_security_ids) ? data.resulting_security_ids : undefined;

// The TX_STOCK_ISSUANCEs in the package history whose security_id is a
// resulting id. It should name exactly one: resulting-stock-exists reports an
// id that names none or several, and the other resulting checks pass over it,
// so a duplicated security_id is reported as itself, whatever order its
// issuances come in.
const resultingStockIssuances = (
  context: DeepReadonly<CheckContext>,
  resultingId: string,
): DeepReadonly<OCFStockIssuance>[] =>
  context.ocfPackageContent.transactions.filter(
    (ele): ele is DeepReadonly<OCFStockIssuance> =>
      ele.object_type === "TX_STOCK_ISSUANCE" && ele.security_id === resultingId,
  );

// The stock issuance a resulting id names, if it names exactly one.
const resultingStockIssuance = (
  context: DeepReadonly<CheckContext>,
  resultingId: string,
): DeepReadonly<OCFStockIssuance> | undefined => {
  const matches = resultingStockIssuances(context, resultingId);
  return matches.length === 1 ? matches[0] : undefined;
};

/**
 * Builds the checks on the stock a transaction turns its security into,
 * worded for that transaction: a convertible's conversion or a warrant's
 * exercise. `name` and `collection` are the family's, as for
 * `familyChecksFor`; `action` names the transaction ("conversion") and
 * `participle` is its past participle ("converted").
 *
 * A convertible's or a warrant's conversion right can only point at a stock
 * class, so every id in resulting_security_ids names a stock issuance. The
 * checks look those issuances up in the package transaction history rather
 * than the live stock collection, so a resulting stock issuance dated the
 * same day counts whether the driver processes it before or after the
 * transaction.
 */
export function resultingChecksFor({
  name,
  collection,
  action,
  participle,
}: Pick<Family, "name" | "collection"> & { action: string; participle: string }) {
  const resultingSecurityNamed = {
    id: "resulting-security-named",
    severity: "warning",
    description: `The ${action} names at least one resulting security.`,
    run: (_context, data) => {
      const ids = resultingIds(data);
      if (ids === undefined || ids.length > 0) return [];
      return [`The ${action} names no resulting security.`];
    },
  } satisfies CheckObject<{ resulting_security_ids: string[] }>;

  const resultingStockExists = {
    id: "resulting-stock-exists",
    severity: "error",
    description:
      "Each resulting security is a stock issuance present in the package.",
    run: (context, data) => {
      const ids = resultingIds(data);
      if (ids === undefined) {
        return [`The ${action}'s resulting_security_ids is not a list of security ids.`];
      }

      const messages: string[] = [];

      // One finding per resulting id that names no stock issuance in history,
      // or more than one.
      ids.forEach((resultingId) => {
        const { length } = resultingStockIssuances(context, resultingId);
        if (length === 0) {
          messages.push(
            text`No stock issuance with security_id ${resultingId} appears in the package.`,
          );
        } else if (length > 1) {
          messages.push(
            text`${length} stock issuances have security_id ${resultingId}, so it doesn't name one resulting security.`,
          );
        }
      });

      return messages;
    },
  } satisfies CheckObject<{ resulting_security_ids: string[] }>;

  const resultingStockDated = {
    id: "resulting-stock-dated",
    severity: "error",
    description:
      `Each resulting stock issuance is dated the same day as the ${action}.`,
    run: (context, data) => {
      const messages: string[] = [];

      // Only resulting ids backed by exactly one stock issuance are judged here;
      // a missing or duplicated id is solely resulting-stock-exists's concern.
      (resultingIds(data) ?? []).forEach((resultingId) => {
        const issuance = resultingStockIssuance(context, resultingId);
        if (issuance !== undefined && issuance.date !== data.date) {
          messages.push(
            text`The resulting stock issuance ${resultingId} is dated ${issuance.date}, which differs from the ${action} date ${data.date}.`,
          );
        }
      });

      return messages;
    },
  } satisfies CheckObject<{ resulting_security_ids: string[]; date: string }>;

  const resultingStockStakeholder = {
    id: "resulting-stock-stakeholder",
    severity: "error",
    description:
      `Each resulting stock issuance names the stakeholder of the ${participle} ${name} issuance.`,
    reads: (data) => [
      securityField(collection, data.security_id, "lifecycle"),
      securityField(collection, data.security_id, "issuance"),
    ],
    run: (context, data, read) => {
      const messages: string[] = [];

      // Compare the stakeholder with the outstanding issuance. If the issuance is missing,
      // issuance-exists already explains the problem.
      const reference =
        read(securityField(collection, data.security_id, "lifecycle")) === "outstanding"
          ? read(securityField(collection, data.security_id, "issuance"))
          : undefined;
      if (reference === undefined) return messages;

      // As with the date check, only resulting ids backed by exactly one stock
      // issuance are judged.
      (resultingIds(data) ?? []).forEach((resultingId) => {
        const issuance = resultingStockIssuance(context, resultingId);
        if (issuance !== undefined && issuance.stakeholder_id !== reference.stakeholder_id) {
          messages.push(
            text`The resulting stock issuance ${resultingId} names stakeholder ${issuance.stakeholder_id}, which differs from the ${name} issuance's stakeholder ${reference.stakeholder_id}.`,
          );
        }
      });

      return messages;
    },
  } satisfies CheckObject<{ security_id: string; resulting_security_ids: string[] }>;

  return { resultingSecurityNamed, resultingStockExists, resultingStockDated, resultingStockStakeholder };
}
