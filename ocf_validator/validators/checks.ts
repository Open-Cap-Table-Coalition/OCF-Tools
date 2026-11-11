import type { OcfMachineContext } from "../../types/validator";
import type { CollectionKey, TxKey } from "../ocfMachine";
import type { CheckObject } from "./checkKit";

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
        `The stakeholder ${data.stakeholder_id} referenced by the transaction was not found in the stakeholder file.`,
      );
    }

    return messages;
  },
} satisfies CheckObject<{ stakeholder_id: string }>;

/**
 * What the shared checks need to know about a family: its name as used in
 * messages ("convertible"), its collection, its issuance and acceptance
 * transaction types, and whether its securities can vest.
 *
 * The types catch mix-ups: `issuance` must be the transaction type that
 * `collection` actually holds, `acceptance` must be a real transaction type,
 * and `vests` must be true exactly when that issuance type has vesting terms
 * (`vesting_terms_id`), so a typo or a wrong flag won't compile.
 */
type Family = {
  [C in CollectionKey]: {
    name: string;
    collection: C;
    issuance: OcfMachineContext[C][number]["object_type"];
    acceptance: Extract<TxKey, `TX_${string}_ACCEPTANCE`>;
    vests: "vesting_terms_id" extends keyof OcfMachineContext[C][number] ? true : false;
  };
}[CollectionKey];

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
 * Builds the checks every security family uses the same way, worded for the
 * given family. Each family's `checks.ts` calls this once, and that family's
 * validators import the checks from there.
 */
export function familyChecksFor({ name, collection, issuance, acceptance, vests }: Family) {
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
   * one.
   */
  const issuanceExists = {
    id: "issuance-exists",
    severity: "error",
    description: `The ${name} issuance referenced by the transaction's security_id is outstanding as of the transaction's date.`,
    run: (context, data) => {
      const messages: string[] = [];

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
      transactions.forEach((ele) => {
        if (ele.object_type === issuance && ele.security_id === data.security_id) {
          if (firstIssuanceDate === undefined) firstIssuanceDate = ele.date;
          if (onOrBeforeDate === undefined && ele.date <= data.date) {
            onOrBeforeDate = ele.date;
          }
        }
      });

      if (firstIssuanceDate === undefined) {
        messages.push(
          `No ${name} issuance with security_id ${data.security_id} appears in the package.`,
        );
      } else if (onOrBeforeDate === undefined) {
        messages.push(
          `The ${name} issuance referenced by security_id ${data.security_id} is dated ${firstIssuanceDate}, after this transaction (${data.date}).`,
        );
      } else {
        messages.push(
          `The ${name} issuance referenced by security_id ${data.security_id} (dated ${onOrBeforeDate}) is not outstanding as of this transaction's date.`,
        );
      }

      return messages;
    },
  } satisfies CheckObject<{ security_id: string; date: string }>;

  // The family's name with its article: "a warrant", "an equity compensation".
  const aName = `${/^[aeiou]/.test(name) ? "an" : "a"} ${name}`;

  // What no-other-transactions' description says the scan exempts.
  const exempt = vests
    ? `${aName} acceptance or a vesting start, event, or acceleration`
    : `${aName} acceptance`;

  /**
   * Nothing dated on or before this transaction refers to this security except
   * its issuance, acceptances, and the transaction being validated, plus its
   * vesting transactions in a family whose securities can vest. A later
   * transaction can't make this one invalid. The cancellation and conversion
   * validators and the warrant exercise run this check; the transfer validators
   * and the equity compensation exercise only declare it, as a gap (see
   * `asGap`).
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
      // ordinary case. The transaction being validated is in the package
      // history too, so it's skipped. It's matched on its type as well as its
      // id: nothing makes ids unique across types, so matching on id alone
      // would also skip another type's transaction that shares it.
      transactions.forEach((ele) => {
        if (
          "security_id" in ele &&
          ele.security_id === data.security_id &&
          ele.date <= data.date &&
          ele.object_type !== issuance &&
          ele.object_type !== acceptance &&
          !(vests && (VESTING_TRANSACTIONS as readonly string[]).includes(ele.object_type)) &&
          !(ele.object_type === data.object_type && ele.id === data.id)
        ) {
          messages.push(
            `Another transaction (${ele.id}) references the transaction's security_id.`,
          );
        }
      });

      return messages;
    },
  } satisfies CheckObject<{ object_type: string; id: string; security_id: string; date: string }>;

  return { issuanceExists, noOtherTransactions };
}
