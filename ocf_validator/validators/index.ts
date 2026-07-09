import valid_tx_stock_issuance from './stock/tx_stock_issuance';
import valid_tx_stock_retraction from './stock/tx_stock_retraction';
import valid_tx_stock_acceptance from './stock/tx_stock_acceptance';
import valid_tx_stock_cancellation from './stock/tx_stock_cancellation';
import valid_tx_stock_conversion from './stock/tx_stock_conversion';
import valid_tx_stock_reissuance from './stock/tx_stock_reissuance';
import valid_tx_stock_repurchase from './stock/tx_stock_repurchase';
import valid_tx_stock_transfer from './stock/tx_stock_transfer';
import valid_tx_equity_compensation_issuance from './equity_compensation/tx_equity_compensation_issuance';
import valid_tx_equity_compensation_retraction from './equity_compensation/tx_equity_compensation_retraction';
import valid_tx_equity_compensation_acceptance from './equity_compensation/tx_equity_compensation_acceptance';
import valid_tx_equity_compensation_cancellation from './equity_compensation/tx_equity_compensation_cancellation';
import valid_tx_equity_compensation_release from './equity_compensation/tx_equity_compensation_release';
import valid_tx_equity_compensation_transfer from './equity_compensation/tx_equity_compensation_transfer';
import valid_tx_equity_compensation_exercise from './equity_compensation/tx_equity_compensation_exercise';
import valid_tx_stock_class_split from './stock_class/tx_stock_class_split';

const validators = {
  valid_tx_stock_issuance,
  valid_tx_stock_retraction,
  valid_tx_stock_acceptance,
  valid_tx_stock_cancellation,
  valid_tx_stock_conversion,
  valid_tx_stock_reissuance,
  valid_tx_stock_repurchase,
  valid_tx_stock_transfer,
  valid_tx_equity_compensation_issuance,
  valid_tx_equity_compensation_retraction,
  valid_tx_equity_compensation_acceptance,
  valid_tx_equity_compensation_cancellation,
  valid_tx_equity_compensation_release,
  valid_tx_equity_compensation_transfer,
  valid_tx_equity_compensation_exercise,
  valid_tx_stock_class_split,
};

export default validators;
