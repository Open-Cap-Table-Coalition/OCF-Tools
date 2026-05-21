// TODO: Once OcfPackageContent carries canonical VestingScheduleTemplate (see
// PR2: migrate-to-canonical-vesting), this transaction type is likely redundant
// — VestingSchedule.start_date carries the start anchor directly, and there is
// no condition_id to reference under the canonical model. Either delete this
// validator + the transaction type, or trim it to a minimal "references a
// known grant" check.
const valid_tx_vesting_start = (context: any, event: any) => {
  let valid = false;
  valid = true;
  // TBC: validation of tx_vesting_start

  if (valid) {
    return true;
  } else {
    return false;
  }
};

export default valid_tx_vesting_start;
