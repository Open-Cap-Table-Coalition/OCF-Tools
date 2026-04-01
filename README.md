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

This tool tests the logical and structural validity of an OCF package. We are continuing to build out the rules set for validity but have good coverage for stock transactions and basic validations for all other transactions. The tool outputs a JSON object with the variables of `result: string` , `report: string[]` and `snapshots: any[]` . The result shows if the package is valid or what the issue is if it is not. The report shows a list of all the validity checks completed per transaction and snapshots shows an array of end of day captables based on the package.

```ts
const ocfValidation = ocfValidator(ocfPackageFolderDir);
```

## OCF Snapshot

This tool allows the user to see the outstanding captable of a OCF package on a given date.

```ts
const snapshot = ocfSnapshot(ocfPackageFolderDir, ocfSnapshotDate);
```

## How to use the toolset

### (before publication to NPM)

Download this repository and run `npm i; npm run build; npm link;`

In the project that you want to use ocf-tools, run `npm link ocf-tools` and add
`const { readOcfPackage, ocfValidator, ocfSnapshot } = require("ocf-tools");`
to the top of the file you want to use the ocf-tools in.
