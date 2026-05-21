# Open Cap Table Format (OCF) Toolset

Version: 0.1.0

Date: 01 April 2026

A growing toolset to help validate and utilize Open Cap Table Format datasets.

Currently, the toolset includes 4 tools:

## Read OCF Package

This tool creates a workable JSON object of the content of an OCF folder from the path of the directory holding the OCF files.

```ts
const ocfPackage = readOcfPackage(ocfPackageFolderDir);
```

## OCF Validator

This tool tests the logical and structural validity of an OCF package. We are continuing to build out the rules set for validity but have good coverage for stock transactions and basic validations for all other transactions. The tool outputs a JSON object with the variables of `result: string` , `report: string[]` and `snapshots: any[]` . The result shows if the package is valid or what the issue is if it is not. The report shows a list of all the validity checks completed per transaction and snapshots shows an array of end of day captables based on the package.

```ts
const ocfValidation = ocfValidator(ocfPackageFolderDir);
```

## OCF Snapshot

This tool allows the user to see the outstanding captable of a OCF package on a given date.

```ts
const snapshot = ocfSnapshot(ocfPackageFolderDir, ocfSnapshotDate);
```

## Compile Vesting

This tool compiles a canonical [`VestingScheduleTemplate`](https://github.com/Open-Cap-Table-Coalition/OCF-Composed-Schemas/tree/main/canonical/vesting) plus a `VestingSchedule` and a total share count into the OCF projection layer: an array of `{ date, amount }` vesting events. Supports time-based vesting with optional cliff under `CUMULATIVE_ROUND_DOWN` allocation (no event-based logic, milestones, or acceleration).

```ts
const events = compileVesting(template, schedule, totalShares);
const events = compileVesting(template, schedule, totalShares, grantDate);
```

**Grant date (optional fourth argument).** When `grantDate` is provided, any events whose computed date falls before it are held back and emitted as a single aggregated event on `grantDate` itself — an implicit cliff at the grant date. This models the common case of vesting backdated to a hire date earlier than the actual grant approval. When omitted, the schedule runs unconstrained from `start_date`.

**Structural validator.** The same package exports `validateVestingScheduleTemplate(t)` and `validateVestingSchedule(s)` (plus assert-wrapper variants), which return `{ valid, errors[] }` for a canonical spec object. `compileVesting` calls these internally; downstream consumers (such as the OCF validator) can call them directly to produce their own structured reports.

**Day-of-month assumption.** The canonical spec does not currently carry a day-of-month policy. This compiler assumes OCF's `VESTING_START_DAY_OR_LAST_DAY_OF_MONTH` semantics: each event preserves the `start_date`'s day-of-month and clamps to the last day in shorter months (Jan 31 → Feb 28 → Mar 31 → …). Other OCF `VestingDayOfMonth` values (fixed numeric days, `*_OR_LAST_DAY_OF_MONTH` variants) are not supported. Revisit if/when the canonical spec adds a `day_of_month` field.

## How to use the toolset

### (before publication to NPM)

Download this repository and run `npm i; npm run build; npm link;`

In the project that you want to use ocf-tools, run `npm link ocf-tools` and add
`const { readOcfPackage, ocfValidator, ocfSnapshot, compileVesting } = require("ocf-tools");`
to the top of the file you want to use the ocf-tools in.
