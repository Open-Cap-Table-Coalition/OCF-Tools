# Validation rules and corner cases

A running list of the rules the validator applies and the corner cases we have settled. Keep each entry to a line or two. Say what the rule is, and point to the test or pull request that pins it down.

To add an entry, put it under the section it belongs to. If we have not decided the answer yet, put it under [Open questions](#open-questions) instead.

## Ground rules

- **A package is immutable.** Nothing in an OCF package is edited in place. Changing a record will need an edit event, and OCF has no such event today. The validator relies on this: it indexes the package once per run. (#247)
- **Transactions run in date order.** On the same day they run by type, in the order listed in [`constants.ts`](../ocf_validator/constants/constants.ts). Two transactions of the same type keep their file order.
- **Same-day stock order.** Issuance, retraction, acceptance, cancellation, conversion, reissuance, repurchase, transfer. So a cancellation always runs before a transfer dated the same day.
- **A security ID is issued once.** The same ID cannot be issued again, in any of the four families.
- **Quantities are decimal strings.** OCF allows up to ten fractional digits. Sums are added exactly, so `0.1` + `0.2` equals `0.3`. (#247)

## Stock named as a balance or result

These rules cover the stock a transfer, cancellation, repurchase, conversion or reissuance names in `balance_security_id` or `resulting_security_ids`. The tests are in [`stockCancellation.test.ts`](../tests/stockCancellation.test.ts).

- **It must be issued the same day** as the transaction that names it.
- **It can be removed earlier that day.** Stock issued and cancelled on the transaction's date still counts, because removals run first. (#247)
- **Stock from an earlier day does not count once removed**, even if the removal is dated the same day as the transaction.
- **Retracted stock never counts.** A retraction voids the issuance, so the stock was never validly issued. (#247)
- **Every resulting security is checked**, not only the last one listed. (#247)

## Stock reissuance

- **Without a split, the quantities must match.** The results must add up to the original quantity. This applies whether `split_transaction_id` is left out or set to null. (#247)
- **With a split, the quantities are not compared.** The split changes the share count.
- **The split must be real.** It must be a `TX_STOCK_CLASS_SPLIT` in the package, dated the same day as the reissuance, for the same stock class as the original stock.
- **Results keep the class and the holder.** Each result has the same stock class and stakeholder as the original, and the reissuance date.
- **Nothing else may use the security.** Only its issuance, an acceptance and this reissuance may name it.

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

## Removed securities

- **Removal on an earlier day blocks later use.** The `no-earlier-removal` check fails only when the removal is dated before the transaction. A removal the same day is allowed, for example vesting on the day of a cancellation. (#214)
- **A retraction fails if the stock was accepted.** The check looks for any acceptance of the same stock in the package, whatever its date.

## Open questions

- **Conversion ratio.** Nothing compares `quantity_converted` with the quantities of the resulting stock.
- **Other transactions on transferred stock.** The transfer check does not yet reject a security that another transaction also names.
- **Quantities that are not decimal strings.** The stock checks still read these as floats, as they did before, instead of rejecting them. Nothing checks the package against the schema first.
- **Edits to a package.** There is no edit event yet, so there is no valid way to correct a record. See the first ground rule.
