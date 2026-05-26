// Reference for tx_equity_compensation_cancellation: https://open-cap-table-coalition.github.io/Open-Cap-Format-OCF/schema_markdown/schema/objects/transactions/cancellation/StockCancellation/
/*
  CURRENT CHECKS:
    1. Check that equity_compensation issuance in incoming security_id reference by transaction exists in current state.
    2. Check to ensure that the date of transaction is the same day or after the date of the incoming equity_compensation issuance.
    3. The security_id of the equity_compensation issuance referred to in the security_id variable must not be the security_id related to any other transactions with the exception of a equity_compensation acceptance transaction.
*/

import {OcfMachineContext} from '../../ocfMachine';

const valid_tx_equity_compensation_cancellation = (
  context: OcfMachineContext,
  event: any,
  isGuard: Boolean = false
) => {
  let validity = false;
  let report: any = {transaction_type: "TX_EQUITY_COMPENSATION_CANCELLATION", transaction_id: event.data.id, transaction_date: event.data.date};

  const {transactions} = context.ocfPackageContent;
  // 1. Check that equity_compensation issuance in incoming security_id reference by transaction exists in current state.
  let incoming_equity_compensationIssuance_validity = false;
  context.equityCompensation.forEach((ele: any) => {
    if (ele.security_id === event.data.security_id) {
      incoming_equity_compensationIssuance_validity = true;
      report.incoming_equity_compensationIssuance_validity = true;
    }
  });

  if (!incoming_equity_compensationIssuance_validity) {
    report.incoming_equity_compensationIssuance_validity = false;
  }

  // 2. Check to ensure that the date of transaction is the same day or after the date of the incoming equity_compensation issuance.
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

  let only_transaction_validity = true;
  transactions.map((ele: any) => {
    if (
      ele.security_id === event.data.security_id &&
      ele.object_type !== 'TX_CANONICAL_EQUITY_COMPENSATION_ISSUANCE' &&
      ele.object_type !== 'TX_EQUITY_COMPENSATION_ACCEPTANCE' &&
      !(ele.object_type === 'TX_EQUITY_COMPENSATION_CANCELLATION' && ele.id === event.data.id)
    ) {
      only_transaction_validity = false;
      report.only_transaction_validity = false;
    }
  });
  if (only_transaction_validity) {
    report.only_transaction_validity = true;
  }

  if (
    incoming_equity_compensationIssuance_validity &&
    incoming_date_validity &&
    only_transaction_validity
  ) {
    validity = true;
  }

  const result = isGuard ? validity : report;
  
  return result;
};

export default valid_tx_equity_compensation_cancellation;
