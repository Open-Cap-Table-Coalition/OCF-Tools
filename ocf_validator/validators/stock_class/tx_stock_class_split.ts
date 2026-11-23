import { OcfMachineContext } from "../../../types/validator";

/*
CURRENT CHECKS:
1. Check if the stock class referenced by the transaction exists in the stock classes file.
*/
// Refrence for tx_stock_issuance transaction: https://open-cap-table-coalition.github.io/Open-Cap-Format-OCF/schema_markdown/schema/objects/transactions/split/StockClassSplit/

const valid_tx_stock_class_split = (context: OcfMachineContext, event: any) => {
  let valid = false;
  const { stockClasses} = context.ocfPackageContent;

  // 1. Check if the stock class referenced by the transaction exists in the stock classes file.
  let stock_class_validity = false;
  stockClasses.forEach((ele: any) => {
    if (ele.id === event.data.stock_class_id) {
        stock_class_validity = true;
      console.log(
        '\x1b[92m\u2714 The stock class for this stock split is in the stock classes file.\x1b[0m'
      );
    }
  });
  if (!stock_class_validity) {
    console.log(
      '\x1b[91m\u2718 The stock class for this stock split is not in the stock classes file.\x1b[0m'
    );
  }

  

  if (stock_class_validity) {
    valid = true;
  }

  if (valid) {
    return true;
  } else {
    return false;
  }
};

export default valid_tx_stock_class_split;
