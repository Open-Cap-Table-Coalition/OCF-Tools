import { buildEquityAward } from "../../vesting_schedule_generator/tests/helpers/equity-award-builder";

export const ocfPackage = buildEquityAward([
  {
    id: "ES-1",
    grantDate: "2017-11-07",
    stakeholderId: "HarryPotter",
    quantity: 100000,
    exercisePrice: 10,
    vestingTermsConfig: {
      id: "4-year-monthly-1-year-cliff",
      installmentCount: 48,
      monthsPerInstallment: 1,
    },
  },
]);
