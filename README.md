# Open Cap Table Format (OCF) Toolset

Version: 0.1.0

Date: 01 April 2026

A growing toolset to help validate and utilize Open Cap Table Format datasets.

Currently, the toolset includes 3 tools:

## Read OCF Package

This tool creates a workable JSON object of the content of an OCF folder from the path of the directory holding the OCF files.

```ts
const ocfPackage = readOcfPackage(ocfPackageFolderDir);
```

## OCF Validator

This tool tests the logical and structural validity of an OCF package. We are continuing to build out the rules set for validity but have good coverage for stock transactions and basic validations for convertible, warrant, and equity compensation transactions. Other transactions, such as vesting and stock class transactions, aren't validated yet.

```ts
const ocfValidation = ocfValidator(ocfPackageFolderDir);
```

Validation goes through the transactions in date order and stops at the first one that fails. The tool outputs an object whose fields include:

- `result: string` says whether the package appears valid, or what made the validation fail: usually the transaction that failed and why. It's the one field that says whether the package is valid. A valid package can still have warnings, and the result counts them: "…appears valid, with 1 warning."
- `findings` lists the problems found by the validators that report findings, today those for convertible and warrant transactions. Each finding has a `severity` (`"error"` or `"warning"`), the id of the `check` that produced it, a `message`, and a `subject`: the `object_type` and `id` of the transaction it's about. An error fails its transaction; a warning doesn't.
- `report` lists, for each stock and equity compensation transaction the tool validates, the checks it did and whether each passed. These validators haven't moved to findings yet.
- `snapshots` holds the cap table at the end of each day with transactions, up to the last day validated in full.

## OCF Snapshot

This tool allows the user to see the outstanding captable of a OCF package on a given date.

```ts
const snapshot = ocfSnapshot(ocfPackageFolderDir, ocfSnapshotDate);
```

`ocfSnapshot` returns the validator's last snapshot on or before that date, or `null` if there isn't one. It doesn't report the validation's result or findings. If the validation failed, it returns the cap table as of the last day validated in full, even for a later date, without saying so. To get the cap table and the validation's outcome together, call `ocfValidator` and read `snapshots`, `result`, and `findings` from its output.

## How to use the toolset

### (before publication to NPM)

Download this repository and run `npm i; npm run build; npm link;`

In the project that you want to use ocf-tools, run `npm link ocf-tools` and add
`const { readOcfPackage, ocfValidator, ocfSnapshot } = require("ocf-tools");`
to the top of the file you want to use the ocf-tools in.
