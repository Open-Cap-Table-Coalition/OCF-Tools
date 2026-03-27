// Pin timezone to UTC so Date serialization in fixture-based tests is
// consistent across local dev machines and CI. Regenerate fixtures with:
//   TZ=UTC npx ts-node -r tsconfig-paths/register testing_scripts/capture_fixtures.ts
process.env.TZ = "UTC";

/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  preset: `ts-jest/presets/default-esm`,
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.json",
      },
    ],
  },
  moduleNameMapper: {
    "^vesting_schedule_generator$": "<rootDir>/vesting_schedule_generator_v1",
    "^vesting_schedule_generator_v1(/.*)?$": "<rootDir>/vesting_schedule_generator_v1$1",
    "^iso_nso_calculator(/.*)?$": "<rootDir>/iso_nso_calculator$1",
    "^read_ocf_package(/.*)?$": "<rootDir>/read_ocf_package$1",
  },
};
