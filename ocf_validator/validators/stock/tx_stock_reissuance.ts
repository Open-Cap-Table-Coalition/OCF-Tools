import {LegacyContext} from '../../ocfMachine';

/*
CURRENT CHECKS:
1. A stock issuance with a corresponding security ID must exist for the security_id variable
2. The date of the stock issuance referred to in the security_id must have a date equal to or earlier than the date of the stock reissuance
3. Any stock issuances with corresponding security IDs referred to in the resulting_security_ids array must exist
4. The dates of any stock issuances referred to in the resulting_security_ids variable must have a date equal to the date of the stock reissuance
5. The security_id of the stock issuance referred to in the security_id variable must not be the security_id related to any other transactions with the exception of a stock acceptance transaction.
6. The quantity of the stock issuance referred to in the security_id variable must equal the sum of the quantities of any stock issuances
   referred to in the resulting_security_ids variable (EXCEPT split transaction id supplied)
7. The stock_class_id of the stock issuance referred to in the security_id variable must equal the stock_class_id of any stock issuances referred to in the resulting_security_ids variable
8. The stakeholder_id of the stock issuance referred to in the security_id variable must equal the stakeholder_id of any stock issuances referred to in the resulting_security_ids variable
9. Split_transaction_id when provided exists as a TX_STOCK_CLASS_SPLIT transaction
10.Split_transaction_id when provided must have the same date as the reissuance date
11.Split_transaction_id when provided must have the same stock class as the incoming security's stock class
*/
const valid_tx_stock_reissuance = (context: LegacyContext, event: any, isGuard: Boolean) => {
  let validity = false;
  const {transactions} = context.ocfPackageContent;
  let report: any = {transaction_type: "TX_STOCK_REISSUANCE", transaction_id: event.data.id, transaction_date: event.data.date};

  // 1. Check that stock issuance in incoming security_id referenced by transaction exists in current state.
  let incoming_stockIssuance_validity = false;
  context.stockIssuances.forEach((ele: any) => {
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

  // 2. Check to ensure that the date of transaction is the same day or after the date of the incoming stock issuance.
  let incoming_quantity = 0;
  let incoming_stock_class = '';
  let incoming_stakeholder = '';
  let incoming_date_validity = false;
  transactions.forEach((ele: any) => {
    if (
      ele.security_id === event.data.security_id &&
      ele.object_type === 'TX_STOCK_ISSUANCE'
    ) {
      incoming_quantity = ele.quantity;
      incoming_stock_class = ele.stock_class_id;
      incoming_stakeholder = ele.stakeholder_id;
      if (ele.date <= event.data.date) {
        incoming_date_validity = true;
        report.incoming_date_validity = true;
      }
    }
  });
  if (!incoming_date_validity) {
    report.incoming_date_validity = false;
  }

  // 3. Any stock issuances with corresponding security IDs referred to in the resulting_security_ids array must exist
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
    }
  }

  // 4. The dates of any stock issuances referred to in the resulting_security_ids variable must have a date equal to the date of the stock reissuance
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
    }
  }

  // 5. The security_id of the stock issuance referred to in the security_id variable must not be the security_id related to any other transactions with the exception of a stock acceptance transaction.
  let only_transaction_validity = true;
  transactions.map((ele: any) => {
    if (
      ele.security_id === event.data.security_id &&
      ele.object_type !== 'TX_STOCK_ISSUANCE' &&
      ele.object_type !== 'TX_STOCK_ACCEPTANCE' &&
      !(ele.object_type === 'TX_STOCK_REISSUANCE' && ele.id === event.data.id)
    ) {
      only_transaction_validity = false;
      report.only_transaction_validity = false;
    }
  });
  if (only_transaction_validity) {
    report.only_transaction_validity = true;
  }

  // 6. The quantity of the stock issuance referred to in the security_id variable must equal the sum of the quantities of any stock issuances
  //    referred to in the resulting_security_ids variable (EXCEPT split transaction id supplied)
  let outgoing_resulting_sum_validity = true;
  if (event.data.split_transaction_id === null) {
    let outgoing_resulting_sum = 0;
    for (let i = 0; i < event.data.resulting_security_ids.length; i++) {
      const res = event.data.resulting_security_ids[i];
      context.stockIssuances.map((ele: any) => {
        if (
          ele.security_id === res &&
          ele.object_type === 'TX_STOCK_ISSUANCE'
        ) {
          outgoing_resulting_sum += parseFloat(ele.quantity);
        }
      });
    }

    outgoing_resulting_sum_validity = false;
    if (outgoing_resulting_sum === incoming_quantity) {
      outgoing_resulting_sum_validity = true;
      report.outgoing_resulting_sum_validity = true;
    }

    if (!outgoing_resulting_sum_validity) {
      report.outgoing_resulting_sum_validity = false;
    }
  }

  // 7. The stock_class_id of the stock issuance referred to in the security_id variable must equal the stock_class_id of any stock issuances referred to in the resulting_security_ids variable
  let resulting_stock_class_validity = false;
  for (let i = 0; i < event.data.resulting_security_ids.length; i++) {
    const res = event.data.resulting_security_ids[i];
    resulting_stock_class_validity = false;
    transactions.map((ele: any) => {
      if (ele.security_id === res && ele.object_type === 'TX_STOCK_ISSUANCE') {
        if (ele.stock_class_id === incoming_stock_class) {
          resulting_stock_class_validity = true;
          report.resulting_stock_class_validity = true;
        }
      }
    });
    if (!resulting_stock_class_validity) {
      report.resulting_stock_class_validity = false;
    }
  }
  // 8. The stakeholder_id of the stock issuance referred to in the security_id variable must equal the stakeholder_id of any stock issuances referred to in the resulting_security_ids variable
  let resulting_stakeholder_validity = false;
  for (let i = 0; i < event.data.resulting_security_ids.length; i++) {
    const res = event.data.resulting_security_ids[i];
    resulting_stakeholder_validity = false;
    transactions.map((ele: any) => {
      if (ele.security_id === res && ele.object_type === 'TX_STOCK_ISSUANCE') {
        if (ele.stakeholder_id === incoming_stakeholder) {
          resulting_stakeholder_validity = true;
          report.resulting_stakeholder_validity = true;
        }
      }
    });
    if (!resulting_stakeholder_validity) {
      report.resulting_stakeholder_validity = false;
    }
  }

  let split_transaction_validity = true;
  let split_transaction_date_validity = true;
  let split_transaction_stock_class_validity = true;
  if (event.data.split_transaction_id) {
    split_transaction_validity = false;
    split_transaction_date_validity = false;
    split_transaction_stock_class_validity = false;
    transactions.map((ele: any) => {
      // 9. Split_transaction_id when provided exists as a TX_STOCK_CLASS_SPLIT transaction
      if (
        ele.id === event.data.split_transaction_id &&
        ele.object_type === 'TX_STOCK_CLASS_SPLIT'
      ) {
        split_transaction_validity = true;
        report.split_transaction_validity = true;
      }
      // 10.Split_transaction_id when provided must have the same date as the reissuance date
      if (
        ele.date === event.data.date &&
        ele.id === event.data.split_transaction_id &&
        ele.object_type === 'TX_STOCK_CLASS_SPLIT'
      ) {
        split_transaction_date_validity = true;
        report.split_transaction_date_validity = true;
      }
      // 11.Split_transaction_id when provided must have the same stock class as the incoming security's stock class
      if (
        ele.stock_class_id === incoming_stock_class &&
        ele.id === event.data.split_transaction_id &&
        ele.object_type === 'TX_STOCK_CLASS_SPLIT'
      ) {
        split_transaction_stock_class_validity = true;
        report.split_transaction_stock_class_validity = true;
      }
    });
    if (!split_transaction_validity) {
      report.split_transaction_validity = false;
    }
    if (!split_transaction_date_validity) {
      report.split_transaction_date_validity = false;
    }
    if (!split_transaction_stock_class_validity) {
      report.split_transaction_stock_class_validity = false;
    }
  }

  if (
    incoming_stockIssuance_validity &&
    incoming_date_validity &&
    resulting_stockIssuances_validity &&
    resulting_dates_validity &&
    only_transaction_validity &&
    outgoing_resulting_sum_validity &&
    resulting_stock_class_validity &&
    resulting_stakeholder_validity &&
    split_transaction_validity &&
    split_transaction_date_validity &&
    split_transaction_stock_class_validity
  ) {
    validity = true;
  }

  const result = isGuard ? validity : report;
  
  return result;
};

export default valid_tx_stock_reissuance;
