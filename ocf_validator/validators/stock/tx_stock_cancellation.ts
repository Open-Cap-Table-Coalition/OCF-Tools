// Reference for tx_stock_cancellation: https://open-cap-table-coalition.github.io/Open-Cap-Format-OCF/schema_markdown/schema/objects/transactions/cancellation/StockCancellation/
/*
  CURRENT CHECKS:
    1. Check that stock issuance in incoming security_id reference by transaction exists in current state.
    2. Check to ensure that the date of transaction is the same day or after the date of the incoming stock issuance.
    3. Check that stock issuance for the balance security_id referenced by transaction exists in current state.
    4. Check to ensure that the date of transaction is the same day as the date of the balance stock issuance.
    5. Check that the stock class of the balance security_id is the sames as the stock class of the incoming security
    6. Check that the quantity of the balance security_id if it exists is greater than 0
    7. Check that the sum of the quantities of the cancellation (and the balance issuance if it exists) is equal to the quantity of the incoming security.
    8. Check cancellation amount is greater than 0 and less than or equal to the incoming security quantity
    9. Only issuance, acceptance, this cancellation, and a subsequent return of plan-issued shares may reference the security.
*/

import {OcfMachineContext} from '../../ocfMachine';

export const hasStockPlan = (id: unknown): boolean => typeof id === "string" && id.length > 0;

const valid_tx_stock_cancellation = (
  context: OcfMachineContext,
  event: any,
  isGuard: Boolean = false
) => {
  let validity = false;
  let report: any = {transaction_type: "TX_STOCK_CANCELLATION", transaction_id: event.data.id, transaction_date: event.data.date};

  const {transactions} = context.ocfPackageContent;
  let incoming_stockClass = '';
  let issuedFromPlan = false;
  // 1. Check that stock issuance in incoming security_id reference by transaction exists in current state.
  let incoming_stockIssuance_validity = false;
  context.stockIssuances.forEach((ele) => {
    if (ele.security_id === event.data.security_id) {
      incoming_stockClass = ele.stock_class_id;
      issuedFromPlan = hasStockPlan(ele.stock_plan_id);
      incoming_stockIssuance_validity = true;
      report.incoming_stockIssuance_validity = true;
    }
  });

  if (!incoming_stockIssuance_validity) {
    report.incoming_stockIssuance_validity = false;
  }

  // 2. Check to ensure that the date of transaction is the same day or after the date of the incoming stock issuance.
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
  let balance_stockIssuance_validity = true;
  let balance_security_outgoing_date_validity = true;
  let balance_stockClass_validity = true;
  let balance_quantity_validity = true;

  if (event.data.balance_security_id) {
    balance_stockIssuance_validity = false;
    context.stockIssuances.forEach((ele: any) => {
      // 3. Check that stock issuance for the balance security_id referenced by transaction exists in current state.
      if (
        ele.security_id === event.data.balance_security_id &&
        ele.object_type === 'TX_STOCK_ISSUANCE'
      ) {
        balance_stockIssuance_validity = true;
        balance_security_outgoing_date_validity = false;
        balance_stockClass_validity = false;
        balance_quantity_validity = false;
        report.balance_stockIssuance_validity = true;
        // 4. Check to ensure that the date of transaction is the same day as the date of the balance stock issuance.
        if (ele.date === event.data.date) {
          balance_security_outgoing_date_validity = true;
          report.balance_security_outgoing_date_validity = true;
        }
        //5. Check that the stock class of the balance security_id is the sames as the stock class of the incoming security
        if (ele.stock_class_id === incoming_stockClass) {
          balance_stockClass_validity = true;
          report.balance_stockClass_validity = true;
        }
        //6. Check that the quantity of the balance security_id if it exists is greater than 0
        if (parseFloat(ele.quantity) > 0) {
          balance_quantity_validity = true;
          report.balance_quantity_validity = true;
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
  if (!balance_stockClass_validity) {
    report.balance_stockClass_validity = false;
  }
  if (!balance_quantity_validity) {
    report.balance_quantity_validity = false;
  }
  // 7. Check that the sum of the quantities of the cancellation (and the balance issuance if it exists) is equal to the quantity of the incoming security.
  let cancel_and_balance_sum_validity = false;
  let cancel_and_balance_quantity = parseFloat(event.data.quantity);
  if (event.data.balance_security_id) {
    context.stockIssuances.forEach((ele: any) => {
      if (
        ele.security_id === event.data.balance_security_id &&
        ele.object_type === 'TX_STOCK_ISSUANCE'
      ) {
        cancel_and_balance_quantity += parseFloat(ele.quantity);
      }
    });
  }
  context.stockIssuances.forEach((ele: any) => {
    if (
      ele.security_id === event.data.security_id &&
      ele.object_type === 'TX_STOCK_ISSUANCE'
    ) {
      if (cancel_and_balance_quantity === parseFloat(ele.quantity)) {
        cancel_and_balance_sum_validity = true;
        report.cancel_and_balance_sum_validity = true;
      }
    }
  });

  if (!cancel_and_balance_sum_validity) {
    report.cancel_and_balance_sum_validity = false;
  }
  //8. Check cancellation amount is greater than 0 and less than or equal to the incoming security quantity
  let cancel_quantity_validity = false;
  transactions.map((ele: any) => {
    if (
      ele.security_id === event.data.security_id &&
      ele.object_type === 'TX_STOCK_ISSUANCE'
    ) {
      if (
        parseFloat(ele.quantity) >= parseFloat(event.data.quantity) &&
        parseFloat(event.data.quantity) > 0
      ) {
        cancel_quantity_validity = true;
        report.cancel_quantity_validity = true;
      }
    }
  });
  if (!cancel_quantity_validity) {
    report.cancel_quantity_validity = false;
  }

  // A return on or after cancellation may name a successor plan.
  let only_transaction_validity = true;
  transactions.map((ele: any) => {
    if (
      ele.security_id === event.data.security_id &&
      ele.object_type !== 'TX_STOCK_ISSUANCE' &&
      ele.object_type !== 'TX_STOCK_ACCEPTANCE' &&
      !(issuedFromPlan && ele.object_type === 'TX_STOCK_PLAN_RETURN_TO_POOL' && ele.date >= event.data.date) &&
      !(ele.object_type === 'TX_STOCK_CANCELLATION' && ele.id === event.data.id)
    ) {
      only_transaction_validity = false;
      report.only_transaction_validity = false;
    }
  });
  if (only_transaction_validity) {
    report.only_transaction_validity = true;
  }

  if (
    incoming_stockIssuance_validity &&
    incoming_date_validity &&
    balance_stockIssuance_validity &&
    balance_security_outgoing_date_validity &&
    cancel_and_balance_sum_validity &&
    cancel_quantity_validity &&
    balance_stockClass_validity &&
    balance_quantity_validity &&
    only_transaction_validity
  ) {
    validity = true;
  }

  const result = isGuard ? validity : report;
  
  return result;
};

export default valid_tx_stock_cancellation;
