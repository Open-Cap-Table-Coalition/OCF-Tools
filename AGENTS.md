# Working on OCF Tools

## Follow a package through the validator

The public functions are exported from `index.ts`. `readOcfPackage` reads the files named in the manifest. The reader parses JSON and does limited validation, so a TypeScript declaration alone is insufficient evidence that a value from a file is usable.

`ocf_validator/index.ts` orders transactions by date and uses `transactionPriority` in `ocf_validator/constants/constants.ts` to break same-day ties. It sends transactions to the XState machine in `ocfMachine.ts`. The machine looks up each transaction in `TX_DESCRIPTORS`, runs its checks, and applies the result. At the end of each transaction day it checks changed stock plans and builds a snapshot. `ocfSnapshot` selects the last snapshot on or before the requested date. Use `ocfValidator` when the caller also needs findings or the reason a run stopped.

## Add or change a rule

- Put the rule with its transaction family in `ocf_validator/validators/`. Use `defineValidator` and reuse a shared check when its inputs and meaning match. Give each check a stable ID within the validator, a severity and a description of the condition being checked. A check without a `run` function appears in the coverage data as unimplemented.
- Return one message for each problem found. Include the relevant OCF IDs, dates or quantities. Use the `text` template helper when formatting values read from a package. The runner supplies the finding's subject, severity and outcome.
- Use `reads` to list each calculated field the check needs. Read those fields through the supplied `read` function. For example, a return to pool needs the source grant's lifecycle. If a failed cancellation left that field uncertain, the return should point to that failure. An independent grant can still check its stakeholder against the input files.
- Register transaction types in the descriptor table and the same-day order. Specify the security family, lifecycle change and any pool operation the transaction performs. Use the existing descriptor for an older name with the same payload. An older name sorts with its current name, so the run keeps their input order on the same day. Exercise both spellings in a mixed same-day history to protect that shared priority.
- The lifecycle charts describe which transitions a family allows. Tests compare their decisions with two existing checks. Snapshots use the chart's tag for visibility. The validator still uses the transaction checks to accept or reject a transaction.

## Update state and report results

`nodes.ts` applies a transaction to the current security and plan records. Use the existing field helpers and return a new map for a changed record. Earlier maps must keep their old values because daily checks compare the current plan with the one at the start of the day. Keep a removed security's record so later checks can identify the removal.

Each tracked field has a value, its last writer and the failures that make it unreliable. A failed error-level check withholds the transaction's changes. A blocked check names the original failures in `roots`. Error-level blocked checks also withhold writes. Warnings allow writes. Legacy stock validators use a separate report and can stop the run. Account for both behaviors when changing a public result.

For stock plans, use `numeric.ts` for exact decimal arithmetic. A new grant draws shares once. A balance grant or resulting grant carries shares already drawn by its source. Test both orders when two transactions refer to one another on the same day. Check limits on the day's final balance. The end-of-day pool check only records a finding. It withholds no grant and marks no field, because the excess belongs to the plan's total and not to one transaction. A valid adjustment replaces the reserve and can restore its reliability. A running total still depends on earlier transactions.

## Test the behavior a caller sees

Use the Node version in `.nvmrc` and install dependencies with `npm ci`. Run `npm run build` for the TypeScript checks, including `types/*.assert.ts`. Run `npm test` for the runtime suite. CI runs the same suite with `npm run test:ci`.

Use a focused check or reducer test for the rule itself. For changes to ordering, findings or snapshots, also use a package through `ocfValidator`. Check the result, who or what the finding identifies, and the affected snapshot. For dependent failures, include an unrelated valid transaction to show that validation continues. Explain any change to a recorded snapshot in terms of the data a caller will now see.

## Write comments, documentation and PR descriptions

Keep code comments short. Write them in plain English that someone new to the project can understand. Name the transaction, field or person affected. Use the names in the OCF schema or code when a reader needs them to find a rule. Explain a technical term the first time its meaning matters. Use ordinary verbs such as “reads,” “checks,” “adds” and “returns.” Avoid invented labels, project shorthand and references to numbered steps that only make sense in an earlier discussion.

Place a comment beside the decision it explains. For example, “Check the plan after the last transaction of the day because a cancellation can identify a balance grant that was issued earlier that day.” The test for that decision should show the final share count. Remove comments that only repeat the next statement.

In a PR description, answer three questions in your own words.

1. What happened before, and why did it matter? Give a small example when the difference is hard to see.
2. What should happen now, and which code owns that decision? Mention changes to public results and limits readers need to understand.
3. How did you test it? Name the command, the case and the result you observed. Label any untested assumption or known failure plainly. A passing suite supports only the cases it exercises.
