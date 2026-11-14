import type { OCFStockIssuance } from "@opencaptablecoalition/ocf-types";
import type { DeepReadonly, OcfMachineContext } from "../../types/validator";
import type { CollectionKey, TxKey } from "../ocfMachine";
import { text, type CheckObject } from "./checkKit";

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
 * What the shared checks need to know about a family: its name as used in
 * messages ("convertible"), its collection, its issuance and acceptance
 * transaction types, whether its securities can vest, whether they can be
 * granted from a stock plan, and which of its transactions leave a security
 * outstanding.
 *
 * The types catch mix-ups: `issuance` must be the transaction type that
 * `collection` actually holds, `acceptance` must be a real transaction type,
 * `vests` must be true exactly when that issuance type has vesting terms
 * (`vesting_terms_id`, or a v2 grant's `vesting_template_id`), and
 * `returnsToPool` must be true exactly when it can name a stock plan
 * (`stock_plan_id`), so a typo or a wrong flag won't compile.
 *
 * `leavesOutstanding` lists the family's transactions that act on a security
 * without retiring it, so that it's still outstanding under the same
 * `security_id` afterwards. An equity compensation exercise or release has a
 * quantity but no balance security, so after a partial one the rest stays on
 * the original security, and a repricing only changes the price. The other
 * families' exercises, conversions, and transfers retire the security, so
 * they leave this out.
 *
 * `deprecatedIssuance` is an older name OCF still accepts for the family's
 * issuance (equity compensation's TX_PLAN_SECURITY_ISSUANCE). The machine
 * doesn't process transactions under it, so a security issued that way is
 * never outstanding to the validator; issuance-exists says that's the reason.
 */
type Family = {
  [C in CollectionKey]: {
    name: string;
    collection: C;
    issuance: OcfMachineContext[C][number]["object_type"];
    acceptance: Extract<TxKey, `TX_${string}_ACCEPTANCE`>;
    vests: HasKey<OcfMachineContext[C][number], "vesting_terms_id" | "vesting_template_id">;
    returnsToPool: HasKey<OcfMachineContext[C][number], "stock_plan_id">;
    leavesOutstanding?: readonly TxKey[];
    deprecatedIssuance?: OcfMachineContext[C][number]["object_type"];
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
  deprecatedIssuance,
}: Family) {
  /**
   * The issuance named by the transaction's `security_id` is outstanding as of
   * the transaction's date. Passes if the family's collection holds a record
   * with that `security_id`. Matching on `security_id` alone is enough because
   * the collection only ever holds issuances, which tests/ocfMachine.test.ts
   * checks.
   *
   * When there's no match, the message says why, worked out from the package's
   * full transaction history: the security was never issued, it's only issued
   * after this transaction, or it was issued on or before this date but is no
   * longer outstanding. The reason and any date it shows come from one history
   * record, preferring a match dated on or before the transaction over a later
   * one. A security issued only under the family's deprecated issuance name
   * gets its own message, since the machine never processes that issuance.
   *
   * A transaction with no date fails: there's no date to be outstanding on.
   */
  const issuanceExists = {
    id: "issuance-exists",
    severity: "error",
    description: `The ${name} issuance referenced by the transaction's security_id is outstanding as of the transaction's date.`,
    run: (context, data) => {
      const messages: string[] = [];

      // OCF requires a date on every transaction, but nothing checks that
      // before the validators run, and a live match below doesn't look at
      // dates. Without this, an undated transaction would pass.
      if (typeof data.date !== "string") {
        messages.push(
          `The transaction has no date, so it can't be checked against the ${name} issuance with security_id ${data.security_id}.`,
        );
        return messages;
      }

      let issuanceExists = false;
      context[collection].forEach((ele) => {
        if (ele.security_id === data.security_id) {
          issuanceExists = true;
        }
      });
      if (issuanceExists) return messages;

      // The object_type comparison comes first because it tells TypeScript this
      // is an issuance, which is what allows reading `security_id` and `date` next.
      const { transactions } = context.ocfPackageContent;
      let firstIssuanceDate: string | undefined;
      let onOrBeforeDate: string | undefined;
      let issuedUnderDeprecatedName = false;
      transactions.forEach((ele) => {
        if (ele.object_type === issuance && ele.security_id === data.security_id) {
          if (firstIssuanceDate === undefined) firstIssuanceDate = ele.date;
          if (onOrBeforeDate === undefined && ele.date <= data.date) {
            onOrBeforeDate = ele.date;
          }
        }
        if (ele.object_type === deprecatedIssuance && ele.security_id === data.security_id) {
          issuedUnderDeprecatedName = true;
        }
      });

      if (firstIssuanceDate === undefined && issuedUnderDeprecatedName) {
        messages.push(
          `The ${name} issuance referenced by security_id ${data.security_id} uses the deprecated type ${deprecatedIssuance}, which the validator doesn't process.`,
        );
      } else if (firstIssuanceDate === undefined) {
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
  // words: "acceptance", then each type in leavesOutstanding without the
  // family's prefix ("TX_EQUITY_COMPENSATION_EXERCISE" is "exercise").
  const prefix = acceptance.slice(0, -"ACCEPTANCE".length);
  const ownExempt = [
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

      // One finding for each other transaction on this security_id dated on or
      // before this one. Many transaction types have no security_id field at
      // all, so it checks for the field first; a transaction without one can't
      // refer to this security. In a family whose securities can vest, vesting
      // transactions are skipped too: they only record the security's vesting,
      // and a security that vests before it's exercised or cancelled is the
      // ordinary case. So are the family's transactions that leave the
      // security outstanding: after a partial exercise, the rest can still be
      // exercised, cancelled, or transferred. In a family whose securities can
      // come from a stock plan, a return to pool is skipped as well: it records
      // where a cancellation's shares went, usually on the same day. The
      // transaction being validated is in the package history too, so it's
      // skipped. It's matched on its type as well as its id: nothing makes ids
      // unique across types, so matching on id alone would also skip another
      // type's transaction that shares it.
      transactions.forEach((ele) => {
        if (
          "security_id" in ele &&
          ele.security_id === data.security_id &&
          ele.date <= data.date &&
          ele.object_type !== issuance &&
          ele.object_type !== acceptance &&
          !(vests && (VESTING_TRANSACTIONS as readonly string[]).includes(ele.object_type)) &&
          !(leavesOutstanding as readonly string[]).includes(ele.object_type) &&
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
  context: DeepReadonly<OcfMachineContext>,
  resultingId: string,
): DeepReadonly<OCFStockIssuance>[] =>
  context.ocfPackageContent.transactions.filter(
    (ele): ele is DeepReadonly<OCFStockIssuance> =>
      ele.object_type === "TX_STOCK_ISSUANCE" && ele.security_id === resultingId,
  );

// The stock issuance a resulting id names, if it names exactly one.
const resultingStockIssuance = (
  context: DeepReadonly<OcfMachineContext>,
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
    run: (context, data) => {
      const messages: string[] = [];

      // The reference stakeholder comes from the live issuance this transaction
      // acts on — the same record issuance-exists matches. With no live record,
      // issuance-exists already carries the failure and there is no reference
      // to compare against, so this check stays silent.
      const reference = context[collection].find(
        (ele) => ele.security_id === data.security_id,
      );
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
