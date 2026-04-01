import { VestingScheduleGenerator } from "vesting_schedule_generator_v1";
import { OcfPackageContent, readOcfPackage } from "../read_ocf_package";
import { isBefore, parseISO } from "date-fns";
import { VestingScheduleStatus } from "../vesting_schedule_generator_v1/types";
import { ExecutionPathBuilder } from "vesting_schedule_generator_v1/ExecutionPathBuilder";
import { VestingConditionStrategyFactory } from "vesting_schedule_generator_v1/vesting-condition-strategies/factory";

const packagePath = "./sample_ocf_folders/acme_holdings_limited";
const securityId = "equity_compensation_issuance_01";
const checkDateString = "2020-06-15";

export function getVestingStatusAsOfDate(): VestingScheduleStatus | null {
  const ocfPackage: OcfPackageContent = readOcfPackage(packagePath);
  const scheduleGenerator = new VestingScheduleGenerator(
    ocfPackage,
    ExecutionPathBuilder,
    VestingConditionStrategyFactory
  );

  const vestingScheduleWithStatus =
    scheduleGenerator.generateScheduleWithStatus(securityId);
  const checkDate = parseISO(checkDateString);

  let latestInstallment: VestingScheduleStatus | null = null;
  for (const installment of vestingScheduleWithStatus) {
    if (isBefore(installment.date, checkDate)) {
      if (
        latestInstallment === null ||
        isBefore(latestInstallment.date, installment.date)
      ) {
        latestInstallment = installment;
      }
    }
  }

  return latestInstallment;
}

if (require.main === module) {
  const result = getVestingStatusAsOfDate();
  if (result === null) {
    console.error("The date provided is before the vesting start date");
  } else {
    console.table(result);
  }
}
