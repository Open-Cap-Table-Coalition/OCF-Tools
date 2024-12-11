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
    "^vesting_schedule_generator$": "<rootDir>/vesting_schedule_generator",
  },
};
