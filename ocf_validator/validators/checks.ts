import type { OcfMachineContext } from "../../types/validator";
import type { CollectionKey, TxKey } from "../ocfMachine";
import type { CheckObject } from "./checkKit";

/**
 * The stakeholder referenced by the transaction exists in the stakeholder file.
 * Family-independent: every issuance references its stakeholder by
 * `stakeholder_id`.
 */
export const stakeholderExists = {
  id: "stakeholder-exists",
  severity: "error",
  description:
    "The stakeholder referenced by the transaction exists in the stakeholder file.",
  run: (context, data) => {
    const messages: string[] = [];
    const { stakeholders } = context.ocfPackageContent;

    // The package reader leaves stakeholders untyped; the parameter annotation
    // names the one field this check reads.
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
 * A security family's vocabulary, as the family checks below read it: the noun
 * the messages use, the live collection, the issuance transaction, and the
 * acceptance and cancellation transactions the no-other-transactions scan
 * exempts. `issuance` is tied to `collection` (it must be the `object_type` the
 * collection holds), and `acceptance` / `cancellation` must be real transaction
 * keys of that kind, so a mismatched or mistyped literal fails to compile.
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
 * The checks every security family shares, phrased in that family's vocabulary.
 * Each family's `checks.ts` calls this once; its validator modules import the
 * results from there.
 */
export function familyChecksFor({ name, collection, issuance, acceptance, cancellation }: Family) {
  /**
   * The issuance referenced by the transaction's security_id exists in the
   * current cap-table state. Matches on security_id alone against the live
   * family collection, which holds only issuances.
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
   * The transaction is dated on or after the issuance it references.
   */
  const dateOrder = {
    id: "date-order",
    severity: "error",
    description: `The transaction is dated on or after the ${name} issuance it references.`,
    run: (context, data) => {
      const messages: string[] = [];
      const { transactions } = context.ocfPackageContent;

      // date-order scans the full package transaction history for the issuance.
      // The object_type test leads so it narrows the transaction union to a
      // security_id-bearing member before the other reads.
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
   * No other transaction references the transaction's security_id, other than
   * the issuance, an acceptance, and the cancellation under validation itself.
   * Implemented by the cancellation validator; the transfer validator declares
   * it as a gap via `asGap`.
   */
  const noOtherTransactions = {
    id: "no-other-transactions",
    severity: "error",
    description: `No other transaction references the transaction's security_id, other than a ${name} acceptance.`,
    run: (context, data) => {
      const messages: string[] = [];
      const { transactions } = context.ocfPackageContent;

      // no-other-transactions emits one finding per transaction on this security_id,
      // exempting the issuance, any acceptance, and this cancellation itself.
      // This scan keeps every transaction type in play, so it narrows by property
      // presence rather than by discriminant: a transaction that carries no
      // security_id can never reference this one.
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
