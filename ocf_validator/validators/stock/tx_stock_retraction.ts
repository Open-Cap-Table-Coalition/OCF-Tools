import {LegacyContext} from '../../ocfMachine';

/*
CURRENT CHECKS:
A stock issuance with a corresponding security ID must exist for the security_id variable
The date of the stock issuance referred to in the security_id must have a date equal to or earlier than the date of the stock retraction
The given stock issuance must not have a stock acceptance transaction associated with it

MISSING CHECKS:
None
*/

const valid_tx_stock_retraction = (context: LegacyContext, event: any, isGuard: Boolean = false) => {
  let validity = false;

  let report: any = {transaction_type: "TX_STOCK_RETRACTION", transaction_id: event.data.id, transaction_date: event.data.date};

  // TBC: validation of tx_stock_retraction
  const {transactions} = context.ocfPackageContent;
  // Check that stock issuance in incoming security_id referenced by transaction exists in current state.
  let incoming_stockIssuance_validity = false;
  context.stockIssuances.forEach((ele: any) => {
    if (
      ele.security_id === event.data.security_id &&
      ele.object_type === 'TX_STOCK_ISSUANCE'
    ) {
      incoming_stockIssuance_validity = true;
      report.incoming_stockIssuance_validity = true
    }
  });
  if (!incoming_stockIssuance_validity) {
    report.incoming_stockIssuance_validity = false

  }

  // Check to ensure that the date of transaction is the same day or after the date of the incoming stock issuance.
  let incoming_date_validity = false;
  transactions.forEach((ele: any) => {
    if (
      ele.security_id === event.data.security_id &&
      ele.object_type === 'TX_STOCK_ISSUANCE'
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

  // Check that stock issuance in incoming security_id does not have a stock acceptance transaction associated with it.
  let no_stock_acceptance_validity = false;
  let stock_acceptance_exists = false;
  transactions.forEach((ele: any) => {
    if (
      ele.security_id === event.data.security_id &&
      ele.object_type === 'TX_STOCK_ACCEPTANCE'
    ) {
      stock_acceptance_exists = true;
    }
  });

  if (!stock_acceptance_exists) {
    no_stock_acceptance_validity = true;
    report.no_stock_acceptance_validity = true;
  }
  if (!no_stock_acceptance_validity) {
    report.no_stock_acceptance_validity = false;
  }

  if (
    incoming_stockIssuance_validity &&
    incoming_date_validity &&
    no_stock_acceptance_validity
  ) {
    validity = true;
  }

  const result = isGuard ? validity : report;
  
  return result;
};

export default valid_tx_stock_retraction;
