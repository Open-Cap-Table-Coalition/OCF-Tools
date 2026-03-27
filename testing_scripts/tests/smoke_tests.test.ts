import { getVestingSchedule } from "../vesting_schedule";
import { getVestingStatusAsOfDate } from "../vesting_status";
import { getIsoNsoResults } from "../iso_calculator";
import { getBackLoadedCliffSchedule } from "../scriptTest";

import vestingScheduleFixture from "../fixtures/vesting_schedule.json";
import vestingStatusFixture from "../fixtures/vesting_status.json";
import isoNsoFixture from "../fixtures/iso_nso_calculator.json";
import backLoadedCliffFixture from "../fixtures/back_loaded_cliff_schedule.json";

/** Normalize Date objects to ISO strings for comparison against JSON fixtures */
function normalize(data: unknown): unknown {
  return JSON.parse(JSON.stringify(data));
}

describe("Vesting schedule (testPackage)", () => {
  it("should match the expected schedule with status", () => {
    const result = getVestingSchedule();
    expect(normalize(result)).toEqual(vestingScheduleFixture);
  });
});

describe("Vesting status as of date (acme_holdings_limited)", () => {
  it("should return the correct status as of 2020-06-15", () => {
    const result = getVestingStatusAsOfDate();
    expect(result).not.toBeNull();
    expect(normalize(result)).toEqual(vestingStatusFixture);
  });
});

describe("ISO/NSO calculator (acme_holdings_limited)", () => {
  it("should match the expected ISO/NSO splits", () => {
    const result = getIsoNsoResults();
    expect(normalize(result)).toEqual(isoNsoFixture);
  });
});

describe("Back-loaded cliff schedule (inline data)", () => {
  it("should match the expected installments", () => {
    const result = getBackLoadedCliffSchedule();
    expect(normalize(result)).toEqual(backLoadedCliffFixture);
  });
});
