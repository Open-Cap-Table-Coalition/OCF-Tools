# How the validator counts stock plan shares

Suppose a company sets aside 1,000 shares and grants an employee an option to buy 100. If the company later cancels 40, when can the plan use those shares again?

## One record for the grant, one for the plan

A **node** is the validator’s record for one thing with an ID. The option’s security node records the original grant and whether it is still outstanding. Older OCF files call this kind of grant a “plan security.” For each fact it tracks, the node keeps the last known value, which transaction last set it (if any), and any failures that put it in doubt.

We used the same design for the plan. **Reserved** is the total number of shares set aside for it. **Drawn** counts the shares charged to it so far, less returns. The validator reads transactions in date order. When it reaches the grant, it records the charge on the option’s node and adds 100 to the plan’s drawn total. Each day’s closing snapshot lists the totals under **stockPlans**.

## Follow a 100-share option

| What happens | Reserved | Drawn |
| --- | ---: | ---: |
| The company sets aside 1,000 shares. | 1,000 | 0 |
| It grants an employee an option for 100 shares. | 1,000 | 100 |
| It cancels 40 and issues a replacement option for the remaining 60. Those 60 were already counted. | 1,000 | 100 |
| It records a return of the 40 cancelled shares to this plan. | 1,000 | 60 |
| It adjusts the reserve to 1,200 shares. | 1,200 | 60 |

## How the rules apply to other transactions

- **Issuing shares.** A new grant or stock issuance draws once from the plan it names. An issuance without a plan leaves every pool alone. Reusing a security ID cannot charge the pool twice.
- **Moving shares.** A replacement grant can carry the original charge after a transfer. So can stock issued from the same plan when an option is exercised or an award is released. The validator checks that the replacement’s date and quantity match what the transaction calls for, even if it reads the replacement first.
- **Returning shares.** Once the validator confirms removal of a grant or plan-issued stock, the cancelled or repurchased shares qualify for return. A retraction makes all remaining shares eligible. Shares moved to another security stay in use. Each return names the receiving plan and uses up some of the original security’s allowance. Returns to a successor plan can take its drawn total below zero.
- **Reading an uncertain total.** If the opening reserve is missing, the snapshot omits it and still shows shares drawn. If a transaction puts a total in doubt, the snapshot names the failure. A check that needs that value points back to the failure that blocked it. A valid adjustment replaces the whole reserve and clears any doubt about it. Drawn keeps earlier failures because it depends on the full history.

## Where to find the code

- [Shared node fields](../ocf_validator/node.ts) and [plan and security records](../ocf_validator/nodes.ts)
- [Pool arithmetic](../ocf_validator/stockPlan.ts), [replacement checks](../ocf_validator/validators/equity_compensation/planChecks.ts), and [return limits](../ocf_validator/validators/stock_plan/tx_stock_plan_return_to_pool.ts)
- [End-of-day snapshots](../ocf_validator/eod.ts) and [tests with worked examples](../tests/stockPlanNode.test.ts)
