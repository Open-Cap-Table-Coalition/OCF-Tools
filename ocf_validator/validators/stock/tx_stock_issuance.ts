import { LegacyContext } from "../../ocfMachine";
import valid_tx_stock_reissuance from "./tx_stock_reissuance";

/*
CURRENT CHECKS:
A stakeholder with a corresponding stakeholder ID must exist
A stock class with corresponding stock class ID must exist
If a stock legend ID included, a stock legend with a corresponding stock legend ID must exist.

MISSING CHECKS:
Is date of stock issuance on or after the date of incorporation and the date of stock class creation?
The quantity of the Stock issuance is equal to or less than the current number of shares authorised at class level (If applicable) minus any outstanding Stock issuances
*/

// Refrence for tx_stock_issuance transaction: https://open-cap-table-coalition.github.io/Open-Cap-Format-OCF/schema_markdown/schema/objects/transactions/issuance/StockIssuance/

const valid_tx_stock_issuance = (context: LegacyContext, event: any, isGuard: Boolean = false) => {
  let validity = false;
  const { stakeholders, stockClasses, stockLegends } = context.ocfPackageContent;
  let report: any = {transaction_type: "TX_STOCK_ISSUANCE", transaction_id: event.data.id, transaction_date: event.data.date};
  
  // Check if the stakeholder referenced by the transaction exists in the stakeholder file.
  let stakeholder_validity = false;
  stakeholders.forEach((ele: any) => {
    if (ele.id === event.data.stakeholder_id) {
      stakeholder_validity = true;
      report.stakeholder_validity = true
    }
  });
  if (!stakeholder_validity) {
    report.stakeholder_validity = false
  }

  // Check if the stock class referenced by the transaction exists in the stock class file.
  let stockClass_validity = false;
  stockClasses.forEach((ele: any) => {
    if (ele.id === event.data.stock_class_id) {
      stockClass_validity = true;
      report.stockClass_validity = true
    }
  });
  if (!stockClass_validity) {
    report.stockClass_validity = false
  }

  // Check if the stock legend(s) referenced by the transaction exists in the stock legend file.
  let stockLegend_validity = false;
  if (event.data.stock_legend_ids?.length === 0) {
    stockLegend_validity = true;
    report.stockLegend_validity = true;
  } else {
    event.data.stock_legend_ids?.forEach((ele: any) => {
      stockLegend_validity = false;
      stockLegends.forEach((ele2: any) => {
        if (ele2.id === ele) {
          stockLegend_validity = true;
          report.stockLegend_validity = true;
        }
      });
    });
  }
  if (!stockLegend_validity) {
    report.stockLegend_validity = false;
  }

  if (stockClass_validity && stakeholder_validity && stockLegend_validity) {
    validity = true;
  }

  const result = isGuard ? validity : report;
  
  return result;
};

export default valid_tx_stock_issuance;
