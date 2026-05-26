import { OcfMachineContext } from "../../ocfMachine";
import {
  compileVesting,
  validateVestingScheduleTemplate,
  type VestingRuntime,
} from "../../../vesting_compiler";
import type { VestingScheduleTemplate } from "../../../types/canonical/vesting";

/*
CURRENT CHECKS:
The referenced stakeholder exists
When stock_plan_id is set, the plan exists in the package
When vesting_template_id is set, it resolves to a VestingScheduleTemplate
When a template is found, it is structurally valid (via validateVestingScheduleTemplate)
When vestings[] is present and a runtime can be constructed from the package's
  TX_CANONICAL_VESTING_START + TX_CANONICAL_VESTING_EVENT transactions, the
  recorded vestings[] equals compileVesting's output for this grant.

MISSING CHECKS:
None
*/

const valid_tx_canonical_equity_compensation_issuance = (
  context: OcfMachineContext,
  event: any,
  isGuard: Boolean,
) => {
  const { stakeholders, stockPlans, vestingScheduleTemplates, transactions } =
    context.ocfPackageContent;
  let validity = false;
  const report: any = {
    transaction_type: "TX_CANONICAL_EQUITY_COMPENSATION_ISSUANCE",
    transaction_id: event.data.id,
    transaction_date: event.data.date,
  };

  // Check 1: stakeholder exists.
  let stakeholder_validity = false;
  stakeholders.forEach((ele: any) => {
    if (ele.id === event.data.stakeholder_id) {
      stakeholder_validity = true;
    }
  });
  report.stakeholder_validity = stakeholder_validity;

  // Check 2: stock plan (when referenced) exists.
  let stock_plan_validity = true;
  if (event.data.stock_plan_id) {
    stock_plan_validity = stockPlans.some(
      (p: any) => p.id === event.data.stock_plan_id,
    );
  }
  report.stock_plan_validity = stock_plan_validity;

  // The remaining checks relate to the optional vesting schedule binding.
  const hasVestingRef = !!event.data.vesting_template_id;

  // Check 3: vesting_template_id (when present) resolves to a template.
  let template: VestingScheduleTemplate | undefined;
  if (hasVestingRef) {
    template = vestingScheduleTemplates.find(
      (t) => t.id === event.data.vesting_template_id,
    );
  }
  const vesting_template_reference_validity = hasVestingRef ? !!template : true;
  report.vesting_template_reference_validity =
    vesting_template_reference_validity;

  // Check 4: the referenced template is structurally valid.
  let vesting_template_structure_validity = true;
  if (template) {
    const result = validateVestingScheduleTemplate(template);
    vesting_template_structure_validity = result.valid;
    if (!result.valid) {
      report.vesting_template_errors = result.errors.map(
        (e) => `${e.path}: ${e.message}`,
      );
    }
  }
  report.vesting_template_structure_validity =
    vesting_template_structure_validity;

  // Check 5: when vestings[] is present and we can construct a runtime,
  // the recorded projection equals compileVesting's output. The check
  // skips gracefully if the runtime can't be built (missing/invalid start
  // or event transactions — those have their own validators).
  let vestings_consistent_with_compiled_schedule_validity = true;
  if (
    event.data.vestings &&
    event.data.vestings.length > 0 &&
    template &&
    vesting_template_structure_validity
  ) {
    const runtime: VestingRuntime = { grantDate: event.data.date };

    const startTx = transactions.find(
      (t: any) =>
        t.object_type === "TX_CANONICAL_VESTING_START" &&
        t.security_id === event.data.security_id,
    );
    if (startTx) runtime.startDate = (startTx as any).date;

    const eventTxs = transactions.filter(
      (t: any) =>
        t.object_type === "TX_CANONICAL_VESTING_EVENT" &&
        t.security_id === event.data.security_id,
    );
    if (eventTxs.length > 0) {
      runtime.eventFirings = eventTxs.map((t: any) => ({
        event_id: t.event_id,
        date: t.date,
        ...(t.realized_fraction
          ? { realized_fraction: t.realized_fraction }
          : {}),
      }));
    }

    try {
      const expected = compileVesting(
        template,
        Number(event.data.quantity),
        runtime,
      );
      vestings_consistent_with_compiled_schedule_validity =
        JSON.stringify(expected) === JSON.stringify(event.data.vestings);
    } catch (e) {
      // Runtime rejected by compiler/validator — leave this check vacuously
      // true; the start/event TX validators will surface the specific issue.
      report.vestings_consistent_skipped_reason = (e as Error).message;
    }
  }
  report.vestings_consistent_with_compiled_schedule_validity =
    vestings_consistent_with_compiled_schedule_validity;

  if (
    stakeholder_validity &&
    stock_plan_validity &&
    vesting_template_reference_validity &&
    vesting_template_structure_validity &&
    vestings_consistent_with_compiled_schedule_validity
  ) {
    validity = true;
  }

  return isGuard ? validity : report;
};

export default valid_tx_canonical_equity_compensation_issuance;
