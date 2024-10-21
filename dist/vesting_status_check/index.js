"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.vestingStatusCheck = void 0;
const read_ocf_package_1 = require("../read_ocf_package");
const vesting_schedule_generator_1 = require("../vesting_schedule_generator");
const vestingStatusCheck = (packagePath, equityCompensationIssuanceSecurityId, checkDate) => {
    const ocfPackage = (0, read_ocf_package_1.readOcfPackage)(packagePath);
    const vestingSchedule = (0, vesting_schedule_generator_1.generateSchedule)(packagePath, equityCompensationIssuanceSecurityId);
    let amountVested = 0;
    let amountUnvested = 0;
    let amountAvailable = 0;
    let amountExercised = 0;
    for (let i = 0; i < vestingSchedule.length; i++) {
        if (Date.parse(vestingSchedule[i].Date) <= Date.parse(checkDate) && Date.parse(vestingSchedule[i + 1].Date) > Date.parse(checkDate)) {
            amountVested = vestingSchedule[i]["Cumulative Vested"];
            amountUnvested = vestingSchedule[i]["Remaining Unvested"];
            amountAvailable = vestingSchedule[i]["Available to Exercise"];
            amountExercised = vestingSchedule[i]["Cumulative Exercised"];
        }
    }
    const status = {
        "Analysis Date: ": checkDate,
        "Amount Unvested: ": amountUnvested,
        "Amount Vested to Date: ": amountVested,
        "Amount Exercised to Date: ": amountExercised,
        "Amount Available to Exercise: ": amountAvailable,
    };
    return status;
};
exports.vestingStatusCheck = vestingStatusCheck;
