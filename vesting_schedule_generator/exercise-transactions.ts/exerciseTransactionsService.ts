// import { compareAsc, parseISO } from "date-fns";
// import type {
//   TX_Equity_Compensation_Exercise,
//   VestingInstallment,
//   OCFDataBySecurityId,
// } from "types";

// export const addExerciseTransactions = (ocfData: OCFDataBySecurityId) => {
//   const exerciseTransactions = ocfData.exerciseTransactions.sort((a, b) =>
//     compareAsc(parseISO(a.date), parseISO(b.date))
//   );
// };

// const lastIndexBeforeExercise = (
//   tx: TX_Equity_Compensation_Exercise,
//   vestingSchedule: VestingInstallment[]
// ) => {
//   const exerciseDate = parseISO(tx.date);

//   const firstIndexOnOrAfterExerciseDate = vestingSchedule.findIndex(
//     (installment) =>
//       // this determines whether installment.date is after or equal to grantDate
//       compareAsc(installment.date, exerciseDate) >= 0
//   );

//   if (firstIndexOnOrAfterExerciseDate < 0) return 0;
//   return firstIndexOnOrAfterExerciseDate - 1;
// };
