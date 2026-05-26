import {OcfMachineContext} from '../../ocfMachine';
// Reference for tx_equity_compensation_transfer transaction: https://open-cap-table-coalition.github.io/Open-Cap-Format-OCF/schema_markdown/schema/objects/transactions/transfer/StockTransfer/

/*
  CURRENT CHECKS:
    1. Does the incoming security_id referenced by transaction exist in current cap table state?
    2. Is the date of transaction the same day or after the date of the incoming issuance?
 MISSING CHECKS:
    1. The security_id of the equity_compensation issuance referred to in the security_id variable must not be the security_id related to any other transactions with the exception of a equity_compensation acceptance transaction.
*/

const valid_tx_equity_compensation_transfer = (context: OcfMachineContext, event: any, isGuard: Boolean) => {
  let validity = false;
  const {transactions} = context.ocfPackageContent;
  let report: any = {transaction_type: "TX_EQUITY_COMPENSATION_TRANSFER", transaction_id: event.data.id, transaction_date: event.data.date};

  // Check that equity_compensation issuance in incoming security_id referenced by transaction exists in current state.
  let incoming_equity_compensationIssuance_validity = false;
  context.equityCompensation.map((ele: any) => {
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
  transactions.map((ele: any) => {
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

export default valid_tx_equity_compensation_transfer;
