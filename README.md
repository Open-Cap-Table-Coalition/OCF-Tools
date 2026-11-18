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

Validation goes through the transactions in date order. A transaction that fails doesn't stop it, as long as its checks report findings: the convertible, warrant, equity compensation, and stock plan pool transactions, and the ones nothing validates. The failure is recorded, what the transaction would have changed is withheld and marked as unreliable, and the run goes on. A later check that depends on something marked isn't run. It is reported as blocked, pointing at the failure it traces back to, so one mistake reads as one error and not as a string of them. A stock transaction that fails still stops the run there, as do a transaction of a type the tool doesn't know and an error in the tool itself.

The tool outputs an object whose fields include:

- `result: string` says whether the package appears valid. It's the one field that says so. A valid package can still have warnings, and the result counts them: "…appears valid, with 1 warning." For a package that isn't valid it counts what was found, keeping the errors apart from their consequences: "…is complete and found 2 errors and 1 check blocked by them." Fix the errors; a blocked check either clears or runs once they are. If the run was stopped, the result says what stopped it instead: usually the transaction that failed and why.
- `findings` lists the problems found by the checks that report findings. Today those are the convertible, warrant, and equity compensation validators' checks, the stock plan pool adjustment's and return to pool's, plus one run on every issuance and on the transactions nothing else validates: that no earlier transaction removed the security. One check is about a stock plan and not a transaction: at the end of each day on which something changed a plan's pool, the shares its grants have drawn must not exceed the shares it has reserved. Its finding's `subject` is the plan (`STOCK_PLAN` and the plan's id). It passes over a plan the package's stock plan files don't have. Each finding has a `severity` (`"error"` or `"warning"`), an `outcome`, the id of the `check` that produced it, a `message`, and a `subject`: the `object_type` and `id` of the transaction it's about. An error fails its transaction; a warning doesn't. The `outcome` is separate from the severity. It is `"failed"` for a check that ran and found its problem. It is `"blocked"` for a check that couldn't run because something it depends on was left unreliable by an earlier failure; such a finding also has `roots`, the `object_type` and `id` of every transaction whose failure it traces back to. A blocked finding says nothing against the transaction it's on. A finding is identified by its `check` and `subject`.
- `report` lists, for each stock transaction the tool validates, the checks it did and whether each passed. The stock validators haven't moved to findings yet; a stock issuance that reuses a removed security fails with a finding instead.
- `snapshots` holds the cap table at the end of each day with transactions, through the last day unless the run was stopped. An entry the run can't vouch for carries a `defects` mark naming the transactions whose failure put it in doubt: under `lifecycle` if a transaction on the security failed, so it's shown as it stood before and may not be outstanding any more, and under `issuance` if its issuance failed, in which case the entry has no other fields. An entry without the mark can be trusted. Each snapshot also lists the package's stock plans under `stockPlans`, with the shares each has `reserved` and the shares its grants have `drawn`. A grant draws its quantity from its plan once, when it's issued; a grant that another transaction names as its balance or resulting security adds nothing; and only a return to pool gives shares back. Stock issued from a plan isn't counted yet. A plan's number carries the same `defects` mark when a failure put it in doubt, and the plan's pool check is then blocked. A later valid pool adjustment makes `reserved` trustworthy again, since it sets the figure outright; nothing does that for `drawn`, which is a running total.
- `nodes` holds the state the run built the snapshots from: every security it issued, including the ones since removed, and every stock plan with its pool. Each security records where it is in its life and its issuance, and for each of those the transaction that last wrote it and any defects affecting it. It replaces the four arrays of outstanding issuances (`stockIssuances`, `convertibleIssuances`, `warrantIssuances`, `equityCompensation`) the output used to carry.

## OCF Snapshot

This tool allows the user to see the outstanding captable of a OCF package on a given date.

```ts
const snapshot = ocfSnapshot(ocfPackageFolderDir, ocfSnapshotDate);
```

`ocfSnapshot` returns the validator's last snapshot on or before that date, or `null` if there isn't one. It doesn't report the validation's result or findings. An entry the validation couldn't vouch for carries the `defects` mark described above. If the validation was stopped, it returns the cap table as of the last day validated in full, even for a later date, without saying so. To get the cap table and the validation's outcome together, call `ocfValidator` and read `snapshots`, `result`, and `findings` from its output.

## How to use the toolset

### (before publication to NPM)

Download this repository and run `npm i; npm run build; npm link;`

In the project that you want to use ocf-tools, run `npm link ocf-tools` and add
`const { readOcfPackage, ocfValidator, ocfSnapshot } = require("ocf-tools");`
to the top of the file you want to use the ocf-tools in.
