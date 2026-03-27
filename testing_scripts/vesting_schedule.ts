import { ExecutionPathBuilder } from "../vesting_schedule_generator_v1/ExecutionPathBuilder.ts";
import { OcfPackageContent, readOcfPackage } from "../read_ocf_package";
import { VestingScheduleGenerator } from "../vesting_schedule_generator_v1/index.ts";
import { VestingConditionStrategyFactory } from "../vesting_schedule_generator_v1/vesting-condition-strategies/factory.ts";

const packagePath = "./testing_scripts/testPackage";
const securityId = "equity_compensation_issuance_01";

export function getVestingSchedule() {
  const ocfPackage: OcfPackageContent = readOcfPackage(packagePath);
  return new VestingScheduleGenerator(
    ocfPackage,
    ExecutionPathBuilder,
    VestingConditionStrategyFactory
  ).generateScheduleWithStatus(securityId);
}

if (require.main === module) {
  console.table(getVestingSchedule());
}
