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

This tool tests the logical and structural validity of an OCF package. We are continuing to build out the rules set for validity but have good coverage for stock transactions and basic validations for convertible, warrant, and equity compensation transactions. A transaction under one of the older `TX_PLAN_SECURITY_*` names is validated as the equity compensation transaction it stands for. Other transactions, such as vesting transactions, are only checked for naming a security removed earlier, if at all.

```ts
const ocfValidation = ocfValidator(ocfPackageFolderDir);
```

Validation processes transactions in date order. Convertible, warrant, equity compensation, and stock plan pool validators record errors and continue. A failed check withholds the transaction’s writes and marks affected fields as unreliable. Later checks that need those fields report a blocked finding. Independent checks still run. Legacy stock validation failures, unknown transaction types, and internal errors can stop validation early.

The output includes these fields.

- `result` states whether the package appears valid. A completed run counts failed errors, blocked checks, and warnings separately. If validation stops early, the result identifies the failure.
- `findings` lists each check’s `severity` (error or warning), `outcome`, `check` ID, `message`, and `subject` (the transaction’s `object_type` and `id`). A `failed` finding reports a problem the check found. A `blocked` finding lists the earlier failures in `roots`. Warnings allow the transaction’s writes. Use `check` and `subject` to group findings, keeping every message in each group.
- `report` contains the legacy stock validators’ checks. A stock issuance that reuses a security ID produces a finding naming the original issuance or the earlier removal.
- `snapshots` contains the cap table at the end of each transaction day the run completed. A row’s optional `defects` lists the causes of uncertainty under `lifecycle` or `issuance`. A failed first issuance appears as a row containing only its defects. Each snapshot also lists the plans under `stockPlans`, with decimal strings for `drawn` and, when known, `reserved`. Either total can have its own `defects` entry.
- `nodes` holds each security’s issuance and lifecycle, including removed securities. Each field records its last writer and any defects. A security ID can be issued only once across all four families. `nodes.plan` holds the current pool totals by plan ID.

A plan starts with its initial reserve and zero drawn shares. An adjustment replaces the reserve. A grant or stock issuance that names the plan draws shares once. For example, cancelling 40 of a 100-share grant and issuing a 60-share balance leaves 100 drawn. An explicit return of 40 brings that total to 60. The source allowance follows the security across all returns, even when a return credits a successor plan. A successor can therefore have a negative drawn balance. A transaction that names a plan absent from the package creates a plan row with an unknown reserve.

To read one of the former issuance lists, use `outstanding` from the package entry point. It returns the family's outstanding issuances in their original order.

```js
const { ocfValidator, outstanding } = require("ocf-tools");

const { nodes } = ocfValidator(ocfPackageFolderDir);
const stock = outstanding(nodes, "stockIssuances");
```

## OCF Snapshot

This tool allows the user to see the outstanding captable of a OCF package on a given date.

```ts
const snapshot = ocfSnapshot(ocfPackageFolderDir, ocfSnapshotDate);
```

`ocfSnapshot` returns the validator's last snapshot on or before that date, or `null` if there isn't one. It doesn't report the validation's result or findings. An entry the validation couldn't vouch for carries the `defects` mark described above. If the validation was stopped, it returns the cap table as of the last day validated in full, even for a later date, without saying so. To get the cap table and the validation's outcome together, call `ocfValidator` and read `snapshots`, `result`, and `findings` from its output.

## How to use the toolset

### (before publication to NPM)

For a local JavaScript project, run these commands in the toolset checkout. The build type-checks the source, and the next command emits the JavaScript used by the linked package.

```sh
npm ci
npm run build
npm exec -- tsc --noEmit false --allowImportingTsExtensions false --noCheck
npm link
```

In the project that you want to use ocf-tools, run `npm link ocf-tools` and add
`const { readOcfPackage, ocfValidator, ocfSnapshot } = require("ocf-tools");`
to the top of the file you want to use the ocf-tools in.
