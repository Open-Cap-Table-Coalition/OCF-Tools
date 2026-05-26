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

This tool compiles a canonical [`VestingScheduleTemplate`](https://github.com/Open-Cap-Table-Coalition/OCF-Composed-Schemas/tree/main/canonical/vesting) plus per-grant runtime data into the OCF projection layer: an array of `{ date, amount }` vesting events. Supports both DATE-anchored (time-based) and EVENT-anchored (named-event triggered) statements, with optional cliff and optional partial-payout fractions on event firings, under `CUMULATIVE_ROUND_DOWN` allocation.

```ts
const events = compileVesting(template, totalShares, runtime);
```

Where `runtime` is:

```ts
interface VestingRuntime {
  startDate?: OCFDate;        // anchor for DATE-anchored statements
  eventFirings?: Array<{      // anchors for EVENT-anchored statements
    event_id: string;
    date: OCFDate;
    realized_fraction?: Fraction;  // partial-payout scaling, defaults to 1
  }>;
  grantDate?: OCFDate;        // optional implicit cliff at the grant date
}
```

These three fields correspond to the canonical-transaction inputs: `startDate` from `TX_CANONICAL_VESTING_START`, `eventFirings` from zero or more `TX_CANONICAL_VESTING_EVENT` transactions, and `grantDate` from `TX_CANONICAL_EQUITY_COMPENSATION_ISSUANCE.date`.

**DATE vs EVENT statements.** Each `VestingStatement` carries a `vesting_base` discriminator. DATE statements chain by `order` from `runtime.startDate`. EVENT statements anchor at the firing date of the matching `event_id` (multiple statements may share an `event_id`; one firing fans out to all of them). Output events are sorted chronologically with `statement.order` as the tie-break.

**Partial firings.** An EVENT firing may carry `realized_fraction`, which scales the matching statement's contribution multiplicatively (e.g., a 50%/grant statement firing at `realized_fraction: 3/10` vests 15% of the grant). EVENT statements whose `event_id` never fires are silently skipped — the grant ends with that portion unvested.

**Grant date.** When `runtime.grantDate` is provided, any events whose computed date falls before it are held back and emitted as a single aggregated event on `grantDate` itself — an implicit cliff at the grant date. This models the common case of vesting backdated to a hire date earlier than the actual grant approval. Applies uniformly to DATE and EVENT events.

**Structural validator.** The same package exports `validateVestingScheduleTemplate(t)` and `validateVestingRuntime(runtime, template)` (plus assert-wrapper variants), which return `{ valid, errors[] }` for canonical inputs. `compileVesting` calls these internally; downstream consumers (such as the OCF validator) can call them directly to produce their own structured reports.

**Day-of-month assumption.** The canonical spec does not currently carry a day-of-month policy. This compiler assumes OCF's `VESTING_START_DAY_OR_LAST_DAY_OF_MONTH` semantics: each event preserves the anchor date's day-of-month and clamps to the last day in shorter months (Jan 31 → Feb 28 → Mar 31 → …). Other OCF `VestingDayOfMonth` values (fixed numeric days, `*_OR_LAST_DAY_OF_MONTH` variants) are not supported. Revisit if/when the canonical spec adds a `day_of_month` field.

## How to use the toolset

### (before publication to NPM)

Download this repository and run `npm i; npm run build; npm link;`

In the project that you want to use ocf-tools, run `npm link ocf-tools` and add
`const { readOcfPackage, ocfValidator, ocfSnapshot, compileVesting } = require("ocf-tools");`
to the top of the file you want to use the ocf-tools in.
