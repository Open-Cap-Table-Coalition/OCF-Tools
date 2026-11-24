# Validation rules and corner cases

A running list of the rules the validator applies and the corner cases we have settled. Keep each entry to a line or two. Say what the rule is, and point to the test or pull request that pins it down.

To add an entry, put it under the section it belongs to. If we have not decided the answer yet, put it under [Open questions](#open-questions) instead.

An entry that cites a pull request that is still open (#247) says what the validator should do once that pull request merges. It also says what the validator does today.

## Ground rules

- **A package is immutable.** Nothing in an OCF package is edited in place. Changing a record will need an edit event, and OCF has no such event today. The validator relies on this: it indexes the package once per run. (#247)
- **Transactions run in date order.** On the same day they run by type, in the order listed in [`constants.ts`](../ocf_validator/constants/constants.ts). Two transactions of the same type keep their file order.
- **Same-day stock order.** Issuance, retraction, acceptance, cancellation, conversion, reissuance, repurchase, transfer. So a cancellation always runs before a transfer dated the same day.
- **A package with no transactions is complete, with nothing checked.** `result` says that no transaction was found. It does not say the package appears valid. There are no findings and no snapshots, and the package's stock plans are still loaded with nothing drawn. The tests are in [`emptyPackage.test.ts`](../tests/emptyPackage.test.ts). (#184)
- **A security ID is issued once.** The same ID cannot be issued again, in any of the four families.
- **Quantities are decimal strings.** OCF allows up to ten fractional digits. [`numeric.ts`](../ocf_validator/numeric.ts) adds them exactly, so `0.1` + `0.2` equals `0.3`. Today only the stock plan checks add quantities with it: a plan's reserve and drawn shares, returns to the pool, plan-issued equity compensation grants, and cancellation or repurchase of plan-issued stock. The other stock checks, including transfer, conversion, reissuance, and cancellation or repurchase of stock not issued from a plan, add quantities as floats and compare them with `===`. A transfer of `0.3` whose results are `0.1` and `0.2` fails for that reason. (#247 moves the transfer, conversion and reissuance quantity checks to exact arithmetic.)

## Stock named as a balance or result

These rules cover the stock a transfer, cancellation, repurchase, conversion or reissuance names in `balance_security_id` or `resulting_security_ids`. The tests are in [`stockCancellation.test.ts`](../tests/stockCancellation.test.ts).

- **It must be issued the same day** as the transaction that names it.
- **It can be removed earlier that day.** Removals run before transfers and repurchases, so stock issued and cancelled on the transaction's date should still count. Today it does not. The balance and quantity-sum checks in cancellation, repurchase, conversion and transfer read only outstanding stock, so a balance issued and cancelled earlier that day can stop validation. (#247)
- **Stock from an earlier day does not count once removed**, even if the removal is dated the same day as the transaction.
- **Retracted stock should not count.** A retraction voids the issuance, so the stock was never validly issued. Today a retracted balance is rejected, because balances are read from outstanding stock. Conversion and reissuance look their results up in the whole package history and never check for a retraction, so a retracted result can pass their existence, date, class and stakeholder checks.
- **Every resulting security is checked**, not only the last one listed. Transfer, conversion and reissuance check the issuance date of each result, and conversion and reissuance also check each result's class and stakeholder. Each failing result gets its own finding, so a valid last result cannot hide an earlier invalid one.

## Stock reissuance

- **Without a split, the quantities must match.** The results must add up to the original quantity, whether `split_transaction_id` is left out or set to null. Today the check runs only when the field is explicitly null. If it is left out, the comparison is skipped, so a reissuance whose results add up to less than the original is accepted. If it is null, the check adds the results as a number and compares that with the original's string quantity using `===`, so even matching quantities are rejected. (#247)
- **With a split, the quantities are not compared.** The split changes the share count.
- **The split must be real.** It must be a `TX_STOCK_CLASS_SPLIT` in the package, dated the same day as the reissuance, for the same stock class as the original stock.
- **Results keep the class and the holder.** Each result has the same stock class and stakeholder as the original, and the reissuance date.
- **Nothing else may use the security.** Only its issuance, an acceptance, its vesting transactions and this reissuance may name it.

## Stock conversion

- **Results change class.** Each result has a different stock class from the original and the same stakeholder.
- **The balance keeps the class.** It has the same stock class and stakeholder as the original, and the conversion date.
- **The balance is what was not converted.** Its quantity equals the original quantity less `quantity_converted`.
- **The converted quantity** is above zero and no more than the original quantity.

## Stock transfer

- **Results add up to the transfer.** The results' quantities equal the transfer `quantity`.
- **Results and balance add up to the original.** Together they equal the original quantity.

## Stock cancellation and repurchase

- **The retired quantity** is above zero and no more than the original quantity.
- **Retired and balance add up to the original.** With no balance, the whole quantity is retired.
- **Stock issued from a plan** may also be named by a later return to the pool. See [How the validator counts stock plan shares](stock-plans.md).

## Stock that vests

OCF has no separate object for a restricted stock award (RSA). It is a `TX_STOCK_ISSUANCE`, and OCF records a forfeiture as a cancellation or repurchase of the unvested shares. The tests are in [`restrictedStockVesting.test.ts`](../tests/restrictedStockVesting.test.ts).

- **Vesting never conflicts with a removal.** A `TX_VESTING_START`, `TX_VESTING_EVENT` or `TX_VESTING_ACCELERATION` that names stock does not make the stock's cancellation, repurchase, conversion or reissuance fail, whatever its date. (#250)
- **Vesting dated after a removal fails on the vesting transaction.** It fails `no-earlier-removal`, and the removal stays valid.
- **After a partial cancellation or repurchase, vesting continues on the balance.** The transaction removes the original `security_id` even when shares remain, as OCF's [Traversing Transactions](https://github.com/Open-Cap-Table-Coalition/Open-Cap-Format-OCF/blob/main/docs/explainers/TraversingTransactions.md) explainer describes. Later vesting must name the stock in `balance_security_id`. Vesting that still names the original fails `no-earlier-removal`.
- **Nothing checks the vesting itself.** The validator does not compare vesting transactions with the stock's vesting terms, its `vestings` list or the quantities cancelled.

## Removed securities

- **Removal on an earlier day blocks later use.** The `no-earlier-removal` check fails only when the removal is dated before the transaction. A removal the same day is allowed, for example vesting on the day of a cancellation. (#214)
- **A retraction fails if the stock was accepted.** The check looks for any acceptance of the same stock in the package, whatever its date.

## Unrecognized transaction types

These rules cover a transaction whose `object_type` the validator has no entry for, such as a type added by a newer version of OCF. The tests are in [`unrecognizedTransactionType.test.ts`](../tests/unrecognizedTransactionType.test.ts). (#186)

- **It is reported, and the run continues.** The transaction gets one `transaction-type-known` error. It is not checked and none of its changes are applied.
- **The security it names can no longer be relied on.** Nothing says what the transaction did to the security in its `security_id`. Its lifecycle and issuance are marked unreliable, whether it is outstanding or removed, and a later check that reads either is blocked and points at the unrecognized transaction.
- **It runs after the day's other transactions.** A security issued that day then has a record to mark. Other transactions on the security that day are checked before it.
- **A security with no issuance in the package is not marked.** There is no record to mark, so a later transaction on that security reports the missing issuance itself.
- **A removal that checks `no-other-transactions` counts an unrecognized transaction on the same security.** It scans the package for transactions dated on or before the removal, including an amendment that runs later that day.
- **Only `security_id` is read.** A security the transaction names in another field, such as `balance_security_id` or `resulting_security_ids`, is not marked. Neither is a stock plan it names.
- **An `object_type` that matches one of the run's own event names is unrecognized too.** A transaction typed `RUN_END` is reported like any other, and is not handled as the run's own event.

## Open questions

- **Stakeholder change events.** OCF allows `CE_STAKEHOLDER_RELATIONSHIP` and `CE_STAKEHOLDER_STATUS` in a transactions file. The validator has no entry for them, so it reports each one as unrecognized. Nothing has decided whether to accept them without a finding or to check them against the stakeholder file.

- **Conversion ratio.** Nothing compares `quantity_converted` with the quantities of the resulting stock.
- **Other transactions on transferred stock.** The transfer check does not yet reject a security that another transaction also names.
- **Quantities that are not decimal strings.** The stock checks still read these as floats, as they did before, instead of rejecting them. Nothing checks the package against the schema first.
- **Edits to a package.** There is no edit event yet, so there is no valid way to correct a record. See the first ground rule.
