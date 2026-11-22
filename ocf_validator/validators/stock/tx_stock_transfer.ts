import {LegacyContext} from '../../ocfMachine';
import { addsUpTo } from "../../numeric";
import { namedStock } from "./outputs";
// Reference for tx_stock_transfer transaction: https://open-cap-table-coalition.github.io/Open-Cap-Format-OCF/schema_markdown/schema/objects/transactions/transfer/StockTransfer/

/*
  CURRENT CHECKS:
    1. Does the incoming security_id referenced by transaction exist in current cap table state?
    2. Is the date of transaction the same day or after the date of the incoming issuance?
    3. Is the quantity of transfer equal to or less than the quantity of the incoming issuance?
    4. Do all of resulting security_ids referenced by transaction exist in current cap table state?
    5. Is the date of transaction the same as all of the resulting issuances?
    6. If there is a balance issuance, does the balance security_id referenced by transaction exist in current cap table state? It can be removed earlier the same day.
    7. If there is a balance issuance, is the date of transaction the same day as the date of the balance issuance?
    8. Does the sum of the quantities of the resulting issuances equal to the quantity of the transfer?
    9. Does the sum of the quantities of the resulting issuances (and the balance issuance if it exists) equal the quantity of the incoming issuance?
    MISSING CHECKS:
    1. The security_id of the stock issuance referred to in the security_id variable must not be the security_id related to any other transactions with the exception of a stock acceptance transaction.
*/

const valid_tx_stock_transfer = (context: LegacyContext, event: any, isGuard: Boolean) => {
  let validity = false;
  const {transactions} = context.ocfPackageContent;
  let report: any = {transaction_type: "TX_STOCK_TRANSFER", transaction_id: event.data.id, transaction_date: event.data.date};

  // Check that stock issuance in incoming security_id referenced by transaction exists in current state.
  let incoming_stockIssuance_validity = false;
  context.stockIssuances.map((ele: any) => {
    if (
      ele.security_id === event.data.security_id &&
      ele.object_type === 'TX_STOCK_ISSUANCE'
    ) {
      incoming_stockIssuance_validity = true;
      report.incoming_stockIssuance_validity = true;
    }
  });
  if (!incoming_stockIssuance_validity) {
    report.incoming_stockIssuance_validity = false;
  }

  // Check to ensure that the date of transaction is the same day or after the date of the incoming stock issuance.
  let incoming_date_validity = false;
  transactions.map((ele: any) => {
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

  // Check that the quantity of the transfer is less or equal to the quantity of the incoming issuance.
  let incoming_quantity_validity = false;
  transactions.map((ele: any) => {
    if (
      ele.security_id === event.data.security_id &&
      ele.object_type === 'TX_STOCK_ISSUANCE'
    ) {
      if (parseFloat(ele.quantity) >= parseFloat(event.data.quantity)) {
        incoming_quantity_validity = true;
        report.incoming_quantity_validity = true;
      }
    }
  });
  if (!incoming_quantity_validity) {
    report.incoming_quantity_validity = false;
  }

  // Check that the resulting stock issuances exist.
  let resulting_stockIssuances_validity = false;
  for (let i = 0; i < event.data.resulting_security_ids.length; i++) {
    const res = event.data.resulting_security_ids[i];
    resulting_stockIssuances_validity = false;
    transactions.map((ele: any) => {
      if (ele.security_id === res && ele.object_type === 'TX_STOCK_ISSUANCE') {
        resulting_stockIssuances_validity = true;
        report.resulting_stockIssuances_validity = true;
      }
    });
    if (!resulting_stockIssuances_validity) {
      report.resulting_stockIssuances_validity = false;
      // Every resulting security must pass, not only the last one named.
      break;
    }
  }

  // Check the dates of the resulting stock issuances.
  let resulting_dates_validity = false;
  for (let i = 0; i < event.data.resulting_security_ids.length; i++) {
    const res = event.data.resulting_security_ids[i];
    resulting_dates_validity = false;
    transactions.map((ele: any) => {
      if (ele.security_id === res && ele.object_type === 'TX_STOCK_ISSUANCE') {
        if (ele.date === event.data.date) {
          resulting_dates_validity = true;
          report.resulting_dates_validity = true;
        }
      }
    });
    if (!resulting_dates_validity) {
      report.resulting_dates_validity = false;
      // Every resulting security must pass, not only the last one named.
      break;
    }
  }

  // Check that the balance stock issuance exists and the date of the balance stock issuance if applicable.
  let balance_stockIssuance_validity = true;
  let balance_security_outgoing_date_validity = true;

  if (event.data.balance_security_id) {
    // Check that stock issuance for the balance security_id referenced by transaction exists in current state.
    balance_stockIssuance_validity = false;
    // The balance or a result can be removed earlier the same day and still count.
    namedStock(context, event.data.balance_security_id, event.data.date).map((ele: any) => {
      if (
        ele.security_id === event.data.balance_security_id &&
        ele.object_type === 'TX_STOCK_ISSUANCE'
      ) {
        balance_stockIssuance_validity = true;
        report.balance_stockIssuance_validity = true;
      }
    });

    // Check to ensure that the date of transaction is the same day as the date of the balance stock issuance.
    balance_security_outgoing_date_validity = false;
    transactions.map((ele: any) => {
      if (
        ele.security_id === event.data.balance_security_id &&
        ele.object_type === 'TX_STOCK_ISSUANCE'
      ) {
        if (ele.date === event.data.date) {
          balance_security_outgoing_date_validity = true;
          report.balance_security_outgoing_date_validity = true;
        }
      }
    });
  }

  if (!balance_stockIssuance_validity) {
    report.balance_stockIssuance_validity = false;
  }

  if (!balance_security_outgoing_date_validity) {
    report.balance_security_outgoing_date_validity = false;
  }

  // Check that the sum of the quantities of the resulting issuance (and the balance issuance if it exists) equal to the quantity of the transfer.
  // Add the quantities exactly, so fractional shares do not round.
  const outgoing_quantities: unknown[] = [];
  for (let i = 0; i < event.data.resulting_security_ids.length; i++) {
    const res = event.data.resulting_security_ids[i];
    namedStock(context, res, event.data.date).map((ele: any) => {
      if (ele.security_id === res && ele.object_type === 'TX_STOCK_ISSUANCE') {
        outgoing_quantities.push(ele.quantity);
      }
    });
  }

  let outgoing_resulting_sum_validity = false;
  if (addsUpTo(outgoing_quantities, event.data.quantity)) {
    outgoing_resulting_sum_validity = true;
    report.outgoing_resulting_sum_validity = true;
  }

  if (!outgoing_resulting_sum_validity) {
    report.outgoing_resulting_sum_validity = false;
  }

  // Check that the sum of the quantities of the resulting issuance (and the balance issuance if it exists) is equal to the quantity of the incoming issuance.
  if (event.data.balance_security_id) {
    namedStock(context, event.data.balance_security_id, event.data.date).map((ele: any) => {
      if (
        ele.security_id === event.data.balance_security_id &&
        ele.object_type === 'TX_STOCK_ISSUANCE'
      ) {
        outgoing_quantities.push(ele.quantity);
      }
    });
  }

  let outgoing_total_sum_validity = false;
  context.stockIssuances.map((ele: any) => {
    if (
      ele.security_id === event.data.security_id &&
      ele.object_type === 'TX_STOCK_ISSUANCE'
    ) {
      if (addsUpTo(outgoing_quantities, ele.quantity)) {
        outgoing_total_sum_validity = true;
        report.outgoing_total_sum_validity = true;
      }
    }
  });

  if (!outgoing_total_sum_validity) {
    report.outgoing_total_sum_validity = false;
  }

  if (
    incoming_stockIssuance_validity &&
    incoming_date_validity &&
    incoming_quantity_validity &&
    resulting_stockIssuances_validity &&
    resulting_dates_validity &&
    balance_stockIssuance_validity &&
    balance_security_outgoing_date_validity &&
    outgoing_resulting_sum_validity &&
    outgoing_total_sum_validity
  ) {
    validity = true;
  }

  const result = isGuard ? validity : report;
  
  return result;
};

export default valid_tx_stock_transfer;
