import { OcfMachineContext } from "../../ocfMachine";
import type { TX_Canonical_Equity_Compensation_Issuance } from "../../../types";

/*
CURRENT CHECKS:
The referenced grant exists (security_id matches a TX_CANONICAL_EQUITY_COMPENSATION_ISSUANCE)
When the grant + its template can be resolved, the template has an EVENT-anchored
  statement whose vesting_base.event_id matches this firing's event_id
realized_fraction (when present) is a valid Fraction in the closed interval [0, 1]
The firing date is not before the grant's issuance date
Only one TX_CANONICAL_VESTING_EVENT per (security_id, event_id) in the package

MISSING CHECKS:
None
*/

const isInteger = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n);

const valid_tx_canonical_vesting_event = (
  context: OcfMachineContext,
  event: any,
  isGuard: Boolean,
) => {
  const { transactions, vestingScheduleTemplates } = context.ocfPackageContent;
  let validity = false;
  const report: any = {
    transaction_type: "TX_CANONICAL_VESTING_EVENT",
    transaction_id: event.data.id,
    transaction_date: event.data.date,
  };

  // Check 1: the referenced grant exists.
  let grant: TX_Canonical_Equity_Compensation_Issuance | undefined;
  transactions.forEach((tx: any) => {
    if (
      tx.object_type === "TX_CANONICAL_EQUITY_COMPENSATION_ISSUANCE" &&
      tx.security_id === event.data.security_id
    ) {
      grant = tx;
    }
  });
  const grant_exists_validity = !!grant;
  report.grant_exists_validity = grant_exists_validity;

  // Check 2: the grant's template has an EVENT statement matching event_id.
  // Vacuously true when grant or template can't be resolved (other checks
  // report those issues).
  let event_id_matches_template_statement_validity = true;
  if (grant && grant.vesting_template_id) {
    const template = vestingScheduleTemplates.find(
      (t) => t.id === grant!.vesting_template_id,
    );
    if (template) {
      event_id_matches_template_statement_validity = template.statements.some(
        (s) =>
          s.vesting_base?.type === "EVENT" &&
          s.vesting_base.event_id === event.data.event_id,
      );
    }
  }
  report.event_id_matches_template_statement_validity =
    event_id_matches_template_statement_validity;

  // Check 3: realized_fraction (when present) is a valid Fraction in [0, 1].
  let realized_fraction_validity = true;
  if (event.data.realized_fraction !== undefined) {
    const rf = event.data.realized_fraction;
    const numOk = isInteger(rf?.numerator);
    const denOk = isInteger(rf?.denominator) && rf.denominator >= 1;
    if (!numOk || !denOk) {
      realized_fraction_validity = false;
    } else {
      // 0 ≤ num/den ≤ 1  ⇔  numerator >= 0 AND numerator <= denominator
      realized_fraction_validity =
        rf.numerator >= 0 && rf.numerator <= rf.denominator;
    }
  }
  report.realized_fraction_validity = realized_fraction_validity;

  // Check 4: the firing date is on or after the grant's issuance date.
  let date_not_before_grant_date_validity = true;
  if (grant) {
    date_not_before_grant_date_validity = event.data.date >= grant.date;
  }
  report.date_not_before_grant_date_validity =
    date_not_before_grant_date_validity;

  // Check 5: only one firing per (security_id, event_id) in the package.
  const firingCount = transactions.filter(
    (tx: any) =>
      tx.object_type === "TX_CANONICAL_VESTING_EVENT" &&
      tx.security_id === event.data.security_id &&
      tx.event_id === event.data.event_id,
  ).length;
  const single_firing_per_event_id_validity = firingCount <= 1;
  report.single_firing_per_event_id_validity =
    single_firing_per_event_id_validity;

  if (
    grant_exists_validity &&
    event_id_matches_template_statement_validity &&
    realized_fraction_validity &&
    date_not_before_grant_date_validity &&
    single_firing_per_event_id_validity
  ) {
    validity = true;
  }

  return isGuard ? validity : report;
};

export default valid_tx_canonical_vesting_event;
