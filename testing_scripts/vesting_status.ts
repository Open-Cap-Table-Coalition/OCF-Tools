import { VestingScheduleGenerator } from "vesting_schedule_generator";
import { OcfPackageContent, readOcfPackage } from "../read_ocf_package";
import { isBefore, parseISO } from "date-fns";
import { VestingScheduleStatus } from "types";
import { ExecutionPathBuilder } from "vesting_schedule_generator/execution-path/ExecutionPathBuilder";
import { ExecutionStrategyFactory } from "vesting_schedule_generator/execution-path/factory";

const packagePath = "./sample_ocf_folders/acme_holdings_limited";
const securityId = "equity_compensation_issuance_01";
const ocfPackage: OcfPackageContent = readOcfPackage(packagePath);

try {
  const checkDateString = "2020-06-15";
  const checkDate = parseISO(checkDateString);
  const scheduleGenerator = new VestingScheduleGenerator(
    ocfPackage,
    ExecutionPathBuilder,
    ExecutionStrategyFactory
  );
  const schedule = scheduleGenerator.generateSchedule(securityId);
  const scheduleWithStatus = scheduleGenerator.getStatus(schedule, securityId); // known to be sorted in ascending order

  const getlatestInstallment = (
    schedule: VestingScheduleStatus[],
    checkDate: Date
  ) => {
    let latestInstallment: VestingScheduleStatus | null = null;
    for (let installment of schedule) {
      if (isBefore(installment.date, checkDate)) {
        if (
          latestInstallment === null ||
          isBefore(latestInstallment.date, checkDate)
        ) {
          latestInstallment = installment;
        }
      }
    }
    return latestInstallment;
  };

  const latestInstallment = getlatestInstallment(scheduleWithStatus, checkDate);

  if (latestInstallment === null) {
    console.log("The date provided is before the vesting start date");
  } else {
    console.table(latestInstallment);
  }
} catch (error) {
  if (error instanceof Error) {
    console.error("Error message:", error.message);
  }
  console.error("Unknown error:", error);
}
