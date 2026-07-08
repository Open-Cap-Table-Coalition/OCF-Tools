import valid_tx_stock_issuance from './stock/tx_stock_issuance';
import valid_tx_stock_retraction from './stock/tx_stock_retraction';
import valid_tx_stock_acceptance from './stock/tx_stock_acceptance';
import valid_tx_stock_cancellation from './stock/tx_stock_cancellation';
import valid_tx_stock_conversion from './stock/tx_stock_conversion';
import valid_tx_stock_reissuance from './stock/tx_stock_reissuance';
import valid_tx_stock_repurchase from './stock/tx_stock_repurchase';
import valid_tx_stock_transfer from './stock/tx_stock_transfer';
import valid_tx_convertible_conversion from './convertible/tx_convertible_conversion';
import valid_tx_warrant_issuance from './warrant/tx_warrant_issuance';
import valid_tx_warrant_retraction from './warrant/tx_warrant_retraction';
import valid_tx_warrant_acceptance from './warrant/tx_warrant_acceptance';
import valid_tx_warrant_cancellation from './warrant/tx_warrant_cancellation';
import valid_tx_warrant_transfer from './warrant/tx_warrant_transfer';
import valid_tx_warrant_exercise from './warrant/tx_warrant_exercise';
import valid_tx_equity_compensation_issuance from './equity_compensation/tx_equity_compensation_issuance';
import valid_tx_equity_compensation_retraction from './equity_compensation/tx_equity_compensation_retraction';
import valid_tx_equity_compensation_acceptance from './equity_compensation/tx_equity_compensation_acceptance';
import valid_tx_equity_compensation_cancellation from './equity_compensation/tx_equity_compensation_cancellation';
import valid_tx_equity_compensation_release from './equity_compensation/tx_equity_compensation_release';
import valid_tx_equity_compensation_transfer from './equity_compensation/tx_equity_compensation_transfer';
import valid_tx_equity_compensation_exercise from './equity_compensation/tx_equity_compensation_exercise';
import valid_tx_plan_security_issuance from './plan_security/tx_plan_security_issuance';
import valid_tx_plan_security_retraction from './plan_security/tx_plan_security_retraction';
import valid_tx_plan_security_acceptance from './plan_security/tx_plan_security_acceptance';
import valid_tx_plan_security_cancellation from './plan_security/tx_plan_security_cancellation';
import valid_tx_plan_security_release from './plan_security/tx_plan_security_release';
import valid_tx_plan_security_transfer from './plan_security/tx_plan_security_transfer';
import valid_tx_plan_security_exercise from './plan_security/tx_plan_security_exercise';
import valid_tx_stock_class_authorized_shares_adjustment from './stock_class/tx_stock_class_authorized_shares_adjustment';
import valid_tx_stock_class_conversion_ratio_adjustment from './stock_class/tx_stock_class_conversion_ratio_adjustment';
import valid_tx_stock_class_split from './stock_class/tx_stock_class_split';
import valid_tx_stock_plan_pool_adjustment from './stock_plan/tx_stock_plan_pool_adjustment';
import valid_tx_stock_plan_return_to_pool from './stock_plan/tx_stock_plan_return_to_pool';
import valid_tx_vesting_acceleration from './vesting/ts_vesting_acceleration';
import valid_tx_vesting_start from './vesting/ts_vesting_start';
import valid_tx_vesting_event from './vesting/ts_vesting_event';

const validators = {
  valid_tx_stock_issuance,
  valid_tx_stock_retraction,
  valid_tx_stock_acceptance,
  valid_tx_stock_cancellation,
  valid_tx_stock_conversion,
  valid_tx_stock_reissuance,
  valid_tx_stock_repurchase,
  valid_tx_stock_transfer,
  valid_tx_convertible_conversion,
  valid_tx_warrant_issuance,
  valid_tx_warrant_retraction,
  valid_tx_warrant_acceptance,
  valid_tx_warrant_cancellation,
  valid_tx_warrant_transfer,
  valid_tx_warrant_exercise,
  valid_tx_equity_compensation_issuance,
  valid_tx_equity_compensation_retraction,
  valid_tx_equity_compensation_acceptance,
  valid_tx_equity_compensation_cancellation,
  valid_tx_equity_compensation_release,
  valid_tx_equity_compensation_transfer,
  valid_tx_equity_compensation_exercise,
  valid_tx_plan_security_issuance,
  valid_tx_plan_security_retraction,
  valid_tx_plan_security_acceptance,
  valid_tx_plan_security_cancellation,
  valid_tx_plan_security_release,
  valid_tx_plan_security_transfer,
  valid_tx_plan_security_exercise,
  valid_tx_stock_class_authorized_shares_adjustment,
  valid_tx_stock_class_conversion_ratio_adjustment,
  valid_tx_stock_class_split,
  valid_tx_stock_plan_pool_adjustment,
  valid_tx_stock_plan_return_to_pool,
  valid_tx_vesting_acceleration,
  valid_tx_vesting_start,
  valid_tx_vesting_event,
};

export default validators;
