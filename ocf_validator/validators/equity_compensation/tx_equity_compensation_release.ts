const valid_tx_equity_compensation_release = (context: any, event: any, isGuard: Boolean) => {
  const {transactions} = context.ocfPackageContent;

  let validity = false;
  let report: any = {transaction_type: "TX_EQUITY_COMPENSATION_RELEASE", transaction_id: event.data.id, transaction_date: event.data.date};

  // Check that equity_compensation issuance in incoming security_id referenced by transaction exists in current state.
  let incoming_equity_compensationIssuance_validity = false;
  context.equity_compensationIssuances.forEach((ele: any) => {
    if (
      ele.security_id === event.data.security_id &&
      ele.object_type === 'TX_CANONICAL_EQUITY_COMPENSATION_ISSUANCE'
    ) {
      incoming_equity_compensationIssuance_validity = true;
      report.incoming_equity_compensationIssuance_validity = true;
    }
  });
  if (!incoming_equity_compensationIssuance_validity) {
    report.incoming_equity_compensationIssuance_validity = false;
  }

  // Check to ensure that the date of transaction is the same day or after the date of the incoming equity_compensation issuance.
  let incoming_date_validity = false;
  transactions.forEach((ele: any) => {
    if (
      ele.security_id === event.data.security_id &&
      ele.object_type === 'TX_CANONICAL_EQUITY_COMPENSATION_ISSUANCE'
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

 

  if (
    incoming_equity_compensationIssuance_validity &&
    incoming_date_validity
  ) {
    validity = true;
  }

  const result = isGuard ? validity : report;
  
  return result;
};

export default valid_tx_equity_compensation_release;
