import { OcfMachineContext } from "../../ocfMachine";
import type { TX_Canonical_Equity_Compensation_Issuance } from "../../../types";

/*
CURRENT CHECKS:
The referenced grant exists (security_id matches a TX_CANONICAL_EQUITY_COMPENSATION_ISSUANCE in the package)
When the grant + its template can be resolved, the template has at least one DATE-anchored statement
The start date is not before the grant's issuance date
Only one TX_CANONICAL_VESTING_START exists for this security in the package

MISSING CHECKS:
None
*/

const valid_tx_canonical_vesting_start = (
  context: OcfMachineContext,
  event: any,
  isGuard: Boolean,
) => {
  const { transactions, vestingScheduleTemplates } = context.ocfPackageContent;
  let validity = false;
  const report: any = {
    transaction_type: "TX_CANONICAL_VESTING_START",
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

  // Check 2: the grant's template has at least one DATE-anchored statement.
  // Vacuously true when grant doesn't exist or vesting_template_id is unset.
  let template_has_date_statement_validity = true;
  if (grant && grant.vesting_template_id) {
    const template = vestingScheduleTemplates.find(
      (t) => t.id === grant!.vesting_template_id,
    );
    if (template) {
      template_has_date_statement_validity = template.statements.some(
        (s) => s.vesting_base?.type === "DATE",
      );
    }
  }
  report.template_has_date_statement_validity =
    template_has_date_statement_validity;

  // Check 3: the start date is on or after the grant's issuance date. Vesting
  // can't legally commence before the grant existed. Vacuously true when
  // grant isn't found (the missing-grant case is reported above).
  let date_not_before_grant_date_validity = true;
  if (grant) {
    date_not_before_grant_date_validity = event.data.date >= grant.date;
  }
  report.date_not_before_grant_date_validity =
    date_not_before_grant_date_validity;

  // Check 4: only one TX_CANONICAL_VESTING_START per security in the package.
  const startCount = transactions.filter(
    (tx: any) =>
      tx.object_type === "TX_CANONICAL_VESTING_START" &&
      tx.security_id === event.data.security_id,
  ).length;
  const single_start_per_security_validity = startCount <= 1;
  report.single_start_per_security_validity =
    single_start_per_security_validity;

  if (
    grant_exists_validity &&
    template_has_date_statement_validity &&
    date_not_before_grant_date_validity &&
    single_start_per_security_validity
  ) {
    validity = true;
  }

  return isGuard ? validity : report;
};

export default valid_tx_canonical_vesting_start;
