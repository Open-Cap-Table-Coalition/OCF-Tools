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
 * messages ("convertible"), its collection, and its issuance, acceptance, and
 * cancellation transaction types.
 *
 * The types catch mix-ups: `issuance` must be the transaction type that
 * `collection` actually holds, and `acceptance` and `cancellation` must be real
 * transaction types, so a typo won't compile.
 */
type Family = {
  [C in CollectionKey]: {
    name: string;
    collection: C;
    issuance: OcfMachineContext[C][number]["object_type"];
    acceptance: Extract<TxKey, `TX_${string}_ACCEPTANCE`>;
    cancellation: Extract<TxKey, `TX_${string}_CANCELLATION`>;
  };
}[CollectionKey];

/**
 * Builds the checks every security family uses the same way, worded for the
 * given family. Each family's `checks.ts` calls this once, and that family's
 * validators import the checks from there.
 */
export function familyChecksFor({ name, collection, issuance, acceptance, cancellation }: Family) {
  /**
   * The issuance named by the transaction's `security_id` is currently on the
   * cap table. Looks it up in the family's collection by `security_id` only.
   * That's enough because the collection only ever holds issuances, which
   * tests/ocfMachine.test.ts checks.
   */
  const issuanceExists = {
    id: "issuance-exists",
    severity: "error",
    description: `The ${name} issuance referenced by the transaction's security_id exists in the current cap-table state.`,
    run: (context, data) => {
      const messages: string[] = [];

      let issuanceExists = false;
      context[collection].forEach((ele) => {
        if (ele.security_id === data.security_id) {
          issuanceExists = true;
        }
      });
      if (!issuanceExists) {
        messages.push(
          `No ${name} issuance with security_id ${data.security_id} exists in the current cap-table state.`,
        );
      }

      return messages;
    },
  } satisfies CheckObject<{ security_id: string }>;

  /**
   * The transaction is dated on or after the issuance it refers to.
   */
  const dateOrder = {
    id: "date-order",
    severity: "error",
    description: `The transaction is dated on or after the ${name} issuance it references.`,
    run: (context, data) => {
      const messages: string[] = [];
      const { transactions } = context.ocfPackageContent;

      // Searches every transaction in the package, not just the current
      // collection. The object_type comparison comes first because it tells
      // TypeScript this is an issuance, which is what allows reading
      // `security_id` and `date` next.
      let dateOrdered = false;
      transactions.forEach((ele) => {
        if (
          ele.object_type === issuance &&
          ele.security_id === data.security_id &&
          ele.date <= data.date
        ) {
          dateOrdered = true;
        }
      });
      if (!dateOrdered) {
        messages.push(
          `The transaction is not dated on or after a ${name} issuance with security_id ${data.security_id}.`,
        );
      }

      return messages;
    },
  } satisfies CheckObject<{ security_id: string; date: string }>;

  /**
   * Nothing refers to this security except its issuance, acceptances, and the
   * cancellation being validated. The cancellation validator runs this check;
   * the transfer validator only declares it, as a gap (see `asGap`).
   */
  const noOtherTransactions = {
    id: "no-other-transactions",
    severity: "error",
    description: `No other transaction references the transaction's security_id, other than a ${name} acceptance.`,
    run: (context, data) => {
      const messages: string[] = [];
      const { transactions } = context.ocfPackageContent;

      // One finding for each other transaction on this security_id. Many
      // transaction types have no security_id field at all, so it checks for the
      // field first; a transaction without one can't refer to this security.
      transactions.forEach((ele) => {
        if (
          "security_id" in ele &&
          ele.security_id === data.security_id &&
          ele.object_type !== issuance &&
          ele.object_type !== acceptance &&
          !(ele.object_type === cancellation && ele.id === data.id)
        ) {
          messages.push(
            `Another transaction (${ele.id}) references the transaction's security_id.`,
          );
        }
      });

      return messages;
    },
  } satisfies CheckObject<{ id: string; security_id: string }>;

  return { issuanceExists, dateOrder, noOtherTransactions };
}
