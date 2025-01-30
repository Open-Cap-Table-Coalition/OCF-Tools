// import { OcfPackageContent, readOcfPackage } from "read_ocf_package";
import { generateVestingSchedule } from "vesting_schedule_generator";
import { ocfPackage } from "../vesting_schedule_generator/tests/testOcfPackages/documentation_examples/4yr-1yr-cliff-schedule";
import { TX_Vesting_Event, TX_Vesting_Start } from "../types";

try {
  const securityId = "equity_compensation_issuance_01";

  const start_event: TX_Vesting_Start = {
    id: "vesting-start",
    object_type: "TX_VESTING_START",
    date: "2025-01-01",
    security_id: "equity_compensation_issuance_01",
    vesting_condition_id: "vesting-start",
  };

  ocfPackage.transactions.push(start_event);

  const vestingSchedule = generateVestingSchedule(ocfPackage, securityId);
  console.table(vestingSchedule);
} catch (error) {
  if (error instanceof Error) {
    console.error("Error message:", error.message);
  }
  console.error("Unknown error:", error);
}
