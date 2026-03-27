import * as fs from "fs";
import * as path from "path";
import { getVestingSchedule } from "./vesting_schedule";
import { getVestingStatusAsOfDate } from "./vesting_status";
import { getIsoNsoResults } from "./iso_calculator";
import { getBackLoadedCliffSchedule } from "./scriptTest";

const fixturesDir = path.join(__dirname, "fixtures");

const fixtures: Record<string, unknown> = {
  "vesting_schedule.json": getVestingSchedule(),
  "vesting_status.json": getVestingStatusAsOfDate(),
  "iso_nso_calculator.json": getIsoNsoResults(),
  "back_loaded_cliff_schedule.json": getBackLoadedCliffSchedule(),
};

for (const [filename, data] of Object.entries(fixtures)) {
  const filePath = path.join(fixturesDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
  console.log(`Wrote ${filePath}`);
}
