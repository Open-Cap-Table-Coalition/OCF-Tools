// TODO: Once OcfPackageContent carries canonical VestingScheduleTemplate (see
// PR2: migrate-to-canonical-vesting), fill this in by:
//   1. Looking up the grant by event.data.security_id in context.equityCompensation
//   2. Looking up the referenced template in context.vestingScheduleTemplates
//   3. Validating the template structurally via validateVestingScheduleTemplate
//      from ../../../vesting_compiler (or its assert variant)
//   4. Calling compileVesting(template, schedule, totalShares, grantDate) and
//      asserting the recorded event matches an entry in the compiled stream
// Build the report in the established pattern: named *_validity boolean per check.
const valid_tx_vesting_event = (context: any, event: any) => {
  let valid = false;
  valid = true;
  // TBC: validation of tx_vesting_event

  if (valid) {
    return true;
  } else {
    return false;
  }
};

export default valid_tx_vesting_event;
