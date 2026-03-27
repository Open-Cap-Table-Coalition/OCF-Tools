const valid_tx_plan_security_retraction = (context: any, event: any, isGuard: Boolean = false) => {
  let validity = false;

  let report: any = {transaction_type: "TX_PLAN_SECURITY_RETRACTION", transaction_id: event.data.id, transaction_date: event.data.date};

  const {transactions} = context.ocfPackageContent;
  // Check that plan security issuance in incoming security_id referenced by transaction exists in current state.
  let incoming_planSecurityIssuance_validity = false;
  context.planSecurityIssuances.forEach((ele: any) => {
    if (
      ele.security_id === event.data.security_id &&
      ele.object_type === 'TX_PLAN_SECURITY_ISSUANCE'
    ) {
      incoming_planSecurityIssuance_validity = true;
      report.incoming_planSecurityIssuance_validity = true
    }
  });
  if (!incoming_planSecurityIssuance_validity) {
    report.incoming_planSecurityIssuance_validity = false

  }

  // Check to ensure that the date of transaction is the same day or after the date of the incoming plan security issuance.
  let incoming_date_validity = false;
  transactions.forEach((ele: any) => {
    if (
      ele.security_id === event.data.security_id &&
      ele.object_type === 'TX_PLAN_SECURITY_ISSUANCE'
    ) {
      if (ele.date <= event.data.date) {
        incoming_date_validity = true;
        report.incoming_date_validity = true;
      }
    }
  });
  if (!incoming_date_validity) {
    report.incoming_date_validity = false;

  }

  // Check that plan security issuance in incoming security_id does not have a plan security acceptance transaction associated with it.
  let no_plan_security_acceptance_validity = false;
  let plan_security_acceptance_exists = false;
  transactions.forEach((ele: any) => {
    if (
      ele.security_id === event.data.security_id &&
      ele.object_type === 'TX_PLAN_SECURITY_ACCEPTANCE'
    ) {
      plan_security_acceptance_exists = true;
    }
  });

  if (!plan_security_acceptance_exists) {
    no_plan_security_acceptance_validity = true;
    report.no_plan_security_acceptance_validity = true;
  }
  if (!no_plan_security_acceptance_validity) {
    report.no_plan_security_acceptance_validity = false;
  }

  if (
    incoming_planSecurityIssuance_validity &&
    incoming_date_validity &&
    no_plan_security_acceptance_validity
  ) {
    validity = true;
  }

  const result = isGuard ? validity : report;

  return result;
};

export default valid_tx_plan_security_retraction;
