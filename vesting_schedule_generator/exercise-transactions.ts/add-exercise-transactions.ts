import type { VestingInstallment, OCFDataBySecurityId } from "types";
// import { ExerciseTransactionsService } from "./exerciseTransactionsService";

export const addExerciseDetailsToVestingSchedule = (
  ocfData: OCFDataBySecurityId,
  vestingSchedule: VestingInstallment[]
) => {
  // const exerciseTransactionsService = new ExerciseTransactionsService({
  //   exerciseTransactions: ocfData.exerciseTransactions,
  //   vestingSchedule: vestingSchedule,
  // });

  // const vestingScheduleWithExercises =
  //   exerciseTransactionsService.handleExerciseTransactions();
  // return vestingScheduleWithExercises;
  return true;
};
