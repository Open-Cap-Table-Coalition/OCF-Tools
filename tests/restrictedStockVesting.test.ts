import type {
  OCFStakeholder,
  OCFStockAcceptance,
  OCFStockCancellation,
  OCFStockClass,
  OCFStockClassSplit,
  OCFStockConversion,
  OCFStockIssuance,
  OCFStockLegendTemplate,
  OCFStockPlan,
  OCFStockPlanReturnToPool,
  OCFStockReissuance,
  OCFStockRepurchase,
  OCFVestingAcceleration,
  OCFVestingEvent,
  OCFVestingStart,
  OCFVestingTerms,
} from "@opencaptablecoalition/ocf-types";
import { describe, expect, it } from "vitest";
import { ocfValidator } from "../ocf_validator";
import { contextWith, runValidator, validatePackageWith } from "./helpers";

// OCF has no separate object for a restricted stock award (RSA). An RSA is a TX_STOCK_ISSUANCE with
// issuance_type "RSA", usually issued from a stock plan and subject to vesting terms. Its vesting is
// recorded by TX_VESTING_START, TX_VESTING_EVENT and TX_VESTING_ACCELERATION transactions that name
// the award's security_id. OCF also has no forfeiture transaction. The company records a forfeiture
// as a TX_STOCK_CANCELLATION or a TX_STOCK_REPURCHASE of the unvested shares.

const VALID = "The validation of the OCF package for Test Co is complete and the package appears valid.";

const stakeholders = [
  { id: "daniel-okafor", object_type: "STAKEHOLDER", name: { legal_name: "Daniel Okafor" }, stakeholder_type: "INDIVIDUAL", current_relationships: ["FOUNDER"] },
  { id: "maya-chen", object_type: "STAKEHOLDER", name: { legal_name: "Maya Chen" }, stakeholder_type: "INDIVIDUAL", current_relationships: ["EMPLOYEE"] },
] satisfies OCFStakeholder[];

const stockClasses = [
  { id: "common", object_type: "STOCK_CLASS", name: "Common Stock", class_type: "COMMON", default_id_prefix: "CS-", initial_shares_authorized: "20000000", votes_per_share: "1", seniority: "1" },
  { id: "class-b-common", object_type: "STOCK_CLASS", name: "Class B Common Stock", class_type: "COMMON", default_id_prefix: "CB-", initial_shares_authorized: "5000000", votes_per_share: "10", seniority: "1" },
] satisfies OCFStockClass[];

const plan = {
  id: "2021-equity-incentive-plan", object_type: "STOCK_PLAN", plan_name: "2021 Equity Incentive Plan",
  initial_shares_reserved: "1000000", stock_class_ids: ["common", "class-b-common"],
} satisfies OCFStockPlan;

const legend = {
  id: "restricted-stock-legend", object_type: "STOCK_LEGEND_TEMPLATE", name: "Restricted Stock Legend",
  text: "THE SHARES REPRESENTED HEREBY ARE SUBJECT TO VESTING, FORFEITURE AND A RIGHT OF REPURCHASE UNDER A RESTRICTED STOCK AGREEMENT BETWEEN THE COMPANY AND THE HOLDER.",
} satisfies OCFStockLegendTemplate;

// For Maya Chen's 48,000 shares these terms vest 4,800 at the Series A closing, 10,800 on the first
// anniversary of the vesting start and 900 a month for the next 36 months.
const vestingTerms = {
  id: "4yr-1yr-cliff-with-financing-milestone", object_type: "VESTING_TERMS",
  name: "Four Year / One Year Cliff, with a Financing Milestone",
  description: "10% of the shares vest when the Company closes its Series A financing. 22.5% vest on the first anniversary of the vesting start date, and 1.875% vest each month after that for 36 months.",
  allocation_type: "CUMULATIVE_ROUNDING",
  vesting_conditions: [
    { id: "vesting-start", quantity: "0", trigger: { type: "VESTING_START_DATE" }, next_condition_ids: ["series-a-closing", "cliff"] },
    { id: "series-a-closing", description: "10% at the closing of the Series A financing", portion: { numerator: "1", denominator: "10" }, trigger: { type: "VESTING_EVENT" }, next_condition_ids: [] },
    {
      id: "cliff", description: "22.5% at one year", portion: { numerator: "9", denominator: "40" },
      trigger: { type: "VESTING_SCHEDULE_RELATIVE", period: { length: 12, type: "MONTHS", occurrences: 1, day_of_month: "VESTING_START_DAY_OR_LAST_DAY_OF_MONTH" }, relative_to_condition_id: "vesting-start" },
      next_condition_ids: ["monthly-thereafter"],
    },
    {
      id: "monthly-thereafter", description: "1.875% each month thereafter", portion: { numerator: "3", denominator: "160" },
      trigger: { type: "VESTING_SCHEDULE_RELATIVE", period: { length: 1, type: "MONTHS", occurrences: 36, day_of_month: "VESTING_START_DAY_OR_LAST_DAY_OF_MONTH" }, relative_to_condition_id: "cliff" },
      next_condition_ids: [],
    },
  ],
} satisfies OCFVestingTerms;

// Daniel Okafor's founder shares take no part in the award. They show that the rest of the package
// still validates.
const founderStock = {
  id: "issue-founder-stock", object_type: "TX_STOCK_ISSUANCE", security_id: "founder-stock", date: "2020-06-01",
  custom_id: "CS-1", stakeholder_id: "daniel-okafor", stock_class_id: "common", issuance_type: "FOUNDERS_STOCK",
  quantity: "4000000", share_price: { amount: "0.0001", currency: "USD" }, stock_legend_ids: [], security_law_exemptions: [],
} satisfies OCFStockIssuance;

const award = {
  id: "issue-award", object_type: "TX_STOCK_ISSUANCE", security_id: "maya-chen-rsa", date: "2021-02-01",
  custom_id: "CS-2", stakeholder_id: "maya-chen", stock_class_id: "common", issuance_type: "RSA",
  stock_plan_id: plan.id, vesting_terms_id: vestingTerms.id, board_approval_date: "2021-01-20",
  quantity: "48000", share_price: { amount: "0.25", currency: "USD" },
  stock_legend_ids: [legend.id], security_law_exemptions: [],
} satisfies OCFStockIssuance;

const acceptance = {
  id: "accept-award", object_type: "TX_STOCK_ACCEPTANCE", security_id: award.security_id, date: "2021-02-08",
} satisfies OCFStockAcceptance;

const vestingStart = {
  id: "start-vesting", object_type: "TX_VESTING_START", security_id: award.security_id, date: "2021-02-01",
  vesting_condition_id: "vesting-start",
} satisfies OCFVestingStart;

const seriesAClosing = {
  id: "vest-at-series-a-closing", object_type: "TX_VESTING_EVENT", security_id: award.security_id, date: "2021-11-15",
  vesting_condition_id: "series-a-closing",
} satisfies OCFVestingEvent;

const acceleration = {
  id: "accelerate-vesting", object_type: "TX_VESTING_ACCELERATION", security_id: award.security_id, date: "2022-07-20",
  quantity: "3000", reason_text: "The Board vested 3,000 shares early in recognition of the product launch.",
} satisfies OCFVestingAcceleration;

// By 2022-08-15 the award has vested 24,000 shares: 4,800 at the Series A closing, 10,800 on
// 2022-02-01, 900 on the first of each month from March to August, and 3,000 by acceleration. The
// other 24,000 are unvested.
const lastDay = "2022-08-15";

/** Stock issued to Maya Chen on `lastDay` for the shares that remain after the award is removed. */
const replacement = (fields: Pick<OCFStockIssuance, "id" | "security_id" | "quantity"> & Partial<OCFStockIssuance>) => ({
  ...award, date: lastDay, custom_id: "CS-3", issuance_type: undefined, vesting_terms_id: undefined, board_approval_date: undefined, ...fields,
}) satisfies OCFStockIssuance;

const returnToPool = {
  id: "return-unvested-shares", object_type: "TX_STOCK_PLAN_RETURN_TO_POOL", security_id: award.security_id, date: lastDay,
  stock_plan_id: plan.id, quantity: "24000", reason_text: "Unvested shares returned to the 2021 Equity Incentive Plan",
} satisfies OCFStockPlanReturnToPool;

// OCF has no forfeiture transaction, so the unvested shares leave by one of these two.
type Unvested = { id: string; security_id: string; date: string; quantity: string; balance_security_id: string };
const cancelUnvested = (fields: Unvested) => ({
  object_type: "TX_STOCK_CANCELLATION", reason_text: "Unvested shares forfeited under the restricted stock agreement", ...fields,
}) satisfies OCFStockCancellation;
const repurchaseUnvested = (fields: Unvested) => ({
  object_type: "TX_STOCK_REPURCHASE", price: { amount: "0.25", currency: "USD" },
  consideration_text: "Repurchased at the 0.25 USD per share that Maya Chen paid", ...fields,
}) satisfies OCFStockRepurchase;

const row = (issue: OCFStockIssuance) => ({
  custom_id: issue.custom_id, stakeholder: issue.stakeholder_id, stock_class: issue.stock_class_id, quantity: issue.quantity,
});

const vestedShares = replacement({ id: "issue-vested-shares", security_id: "maya-chen-vested-shares", quantity: "24000" });
const leaving = { id: "retire-unvested-shares", security_id: award.security_id, date: lastDay, quantity: "24000", balance_security_id: vestedShares.security_id };
const afterLeaving = { stockIssuances: [founderStock, vestedShares].map(row), stockPlans: [{ id: plan.id, reserved: "1000000", drawn: "24000" }] };

const convertedShares = replacement({ id: "issue-converted-shares", security_id: "maya-chen-converted-shares", quantity: "48000", vesting_terms_id: vestingTerms.id });

// A 2-for-1 split doubles every holder's Common Stock, so the founder's shares are reissued too.
const split = {
  id: "common-2-for-1-split", object_type: "TX_STOCK_CLASS_SPLIT", date: lastDay, stock_class_id: "common",
  split_ratio: { numerator: "2", denominator: "1" },
} satisfies OCFStockClassSplit;
const splitShares = replacement({ id: "issue-split-shares", security_id: "maya-chen-split-shares", quantity: "96000", vesting_terms_id: vestingTerms.id });
const founderSplitShares = { ...founderStock, id: "issue-founder-split-shares", security_id: "founder-split-shares", date: lastDay, custom_id: "CS-4", quantity: "8000000" } satisfies OCFStockIssuance;
const founderReissuance = {
  id: "reissue-founder-stock-after-split", object_type: "TX_STOCK_REISSUANCE", security_id: founderStock.security_id, date: lastDay,
  resulting_security_ids: [founderSplitShares.security_id], split_transaction_id: split.id,
} satisfies OCFStockReissuance;

/**
 * Four ways the award leaves the cap table on `lastDay`. Each lists the award, the transaction that
 * removes it, the other transactions dated that day, and what that day's snapshot shows.
 */
const endings = [
  {
    name: "a cancellation of the unvested shares when the holder leaves",
    award, removal: cancelUnvested(leaving), alsoThatDay: [vestedShares, returnToPool],
    founder: founderStock, lastSnapshot: afterLeaving,
  },
  {
    name: "a repurchase of the unvested shares when the holder leaves",
    award, removal: repurchaseUnvested(leaving), alsoThatDay: [vestedShares, returnToPool],
    founder: founderStock, lastSnapshot: afterLeaving,
  },
  {
    name: "a conversion of a Class B award into Common Stock",
    award: { ...award, stock_class_id: "class-b-common", custom_id: "CB-1" } satisfies OCFStockIssuance,
    removal: {
      id: "convert-class-b-award", object_type: "TX_STOCK_CONVERSION", security_id: award.security_id, date: lastDay,
      quantity_converted: "48000", resulting_security_ids: [convertedShares.security_id],
    } satisfies OCFStockConversion,
    alsoThatDay: [convertedShares],
    founder: founderStock,
    lastSnapshot: { stockIssuances: [founderStock, convertedShares].map(row), stockPlans: [{ id: plan.id, reserved: "1000000", drawn: "48000" }] },
  },
  {
    name: "a reissuance after a 2-for-1 split of the Common Stock",
    award,
    removal: {
      id: "reissue-award-after-split", object_type: "TX_STOCK_REISSUANCE", security_id: award.security_id, date: lastDay,
      resulting_security_ids: [splitShares.security_id], split_transaction_id: split.id,
      reason_text: "Reissued for the 2-for-1 split of the Common Stock",
    } satisfies OCFStockReissuance,
    alsoThatDay: [split, splitShares, founderSplitShares, founderReissuance],
    founder: founderSplitShares,
    lastSnapshot: { stockIssuances: [splitShares, founderSplitShares].map(row) },
  },
];

type Ending = (typeof endings)[number];

const validate = (transactions: Record<string, unknown>[]) =>
  validatePackageWith(ocfValidator)(transactions, stakeholders, stockClasses, [plan], { stockLegends: [legend], vestingTerms: [vestingTerms] });

/** The package up to the award's removal, with the vesting transactions given. */
const history = (ending: Ending, vesting: Record<string, unknown>[] = [vestingStart, seriesAClosing, acceleration]) =>
  [founderStock, ending.award, acceptance, ...vesting, ...ending.alsoThatDay, ending.removal];

describe.each(endings)("a restricted stock award with vesting transactions, ended by $name", (ending) => {
  const { removal, founder, lastSnapshot } = ending;

  it("is valid after a vesting start, a vesting event and a vesting acceleration", () => {
    const context = validate(history(ending));

    expect(context.findings).toEqual([]);
    expect(context.result).toBe(VALID);
    expect(context.snapshots.at(-2)?.stockIssuances).toMatchObject([row(founderStock), row(ending.award)]);
    expect(context.snapshots.at(-1)).toMatchObject({ date: lastDay, ...lastSnapshot });
  });

  it("is valid when the acceleration is approved on the day of the removal", () => {
    const context = validate(history(ending, [vestingStart, seriesAClosing, { ...acceleration, date: lastDay }]));

    expect(context.findings).toEqual([]);
    expect(context.result).toBe(VALID);
    expect(context.snapshots.at(-1)).toMatchObject({ date: lastDay, ...lastSnapshot });
  });

  it("reports a vesting event recorded after the removal on the vesting event", () => {
    const lateEvent = { ...seriesAClosing, id: "vest-after-removal", date: "2022-11-15" } satisfies OCFVestingEvent;
    const context = validate([...history(ending), lateEvent]);

    expect(context.findings).toEqual([{
      subject: { object_type: "TX_VESTING_EVENT", id: lateEvent.id }, check: "no-earlier-removal", severity: "error", outcome: "failed",
      message: `The security ${award.security_id} was removed from the cap table by ${removal.id} on ${lastDay}.`,
    }]);
    // The removal is still applied. The award is gone and the stock that replaced it remains.
    expect(context.snapshots.at(-1)).toMatchObject({ date: lateEvent.date, ...lastSnapshot });
  });

  it("still fails when a second cancellation names the award", () => {
    const secondCancellation = {
      id: "cancel-award-again", object_type: "TX_STOCK_CANCELLATION", security_id: award.security_id, date: "2022-09-01",
      quantity: "48000", reason_text: "The award was cancelled a second time by mistake",
    } satisfies OCFStockCancellation;
    const context = validate([...history(ending), secondCancellation]);

    // The finding names the second cancellation and none of the vesting transactions.
    expect(context.findings.filter((finding) => finding.subject.id === removal.id)).toEqual([{
      subject: { object_type: removal.object_type, id: removal.id }, check: "no-other-transactions", severity: "error", outcome: "failed",
      message: `Transaction ${secondCancellation.id} also references stock ${award.security_id}.`,
    }]);
    // The founder's stock is unaffected by the failure.
    expect(context.findings.filter((finding) => finding.subject.id === founder.id)).toEqual([]);
    expect(context.snapshots.at(-1)?.stockIssuances).toContainEqual(expect.objectContaining(row(founder)));
  });
});

// A cancellation or repurchase of part of an award removes the award's security_id. The shares that
// remain are issued as the security named in balance_security_id, and their vesting continues there.
//
// Here Maya Chen moves to a part-time role on 2022-08-15 and gives up 12,000 of her 24,000 unvested
// shares. The other 36,000 shares become a new award: 24,000 already vested, 6,000 vesting on
// 2023-02-15 and 6,000 on 2023-08-15. The Board vests 2,000 of the last 6,000 early, and when she
// leaves on 2023-05-01 the 4,000 still unvested go the same way as the first 12,000.
describe.each([
  { name: "cancellation", retire: cancelUnvested },
  { name: "repurchase", retire: repurchaseUnvested },
])("a restricted stock award partly forfeited by $name while the rest keeps vesting", ({ retire }) => {
  const partTimeAward = replacement({
    id: "issue-part-time-award", security_id: "maya-chen-part-time-rsa", quantity: "36000", issuance_type: "RSA",
    vestings: [{ date: lastDay, amount: "24000" }, { date: "2023-02-15", amount: "6000" }, { date: "2023-08-15", amount: "6000" }],
  });
  const firstForfeiture = retire({ id: "retire-shares-on-part-time-move", security_id: award.security_id, date: lastDay, quantity: "12000", balance_security_id: partTimeAward.security_id });
  const firstReturn = { ...returnToPool, id: "return-shares-on-part-time-move", quantity: "12000" } satisfies OCFStockPlanReturnToPool;

  const laterAcceleration = {
    id: "accelerate-part-time-award", object_type: "TX_VESTING_ACCELERATION", security_id: partTimeAward.security_id, date: "2023-04-20",
    quantity: "2000", reason_text: "The Board vested 2,000 shares early under Maya Chen's separation agreement.",
  } satisfies OCFVestingAcceleration;

  const leavingDay = "2023-05-01";
  const finalShares = replacement({ id: "issue-final-shares", security_id: "maya-chen-final-shares", date: leavingDay, custom_id: "CS-4", quantity: "32000" });
  const secondForfeiture = retire({ id: "retire-shares-on-leaving", security_id: partTimeAward.security_id, date: leavingDay, quantity: "4000", balance_security_id: finalShares.security_id });
  const secondReturn = { ...returnToPool, id: "return-shares-on-leaving", security_id: partTimeAward.security_id, date: leavingDay, quantity: "4000" } satisfies OCFStockPlanReturnToPool;

  const packageWith = (later: OCFVestingAcceleration) => [
    founderStock, award, acceptance, vestingStart, seriesAClosing, acceleration,
    partTimeAward, firstForfeiture, firstReturn,
    later,
    finalShares, secondForfeiture, secondReturn,
  ];
  const drawn = (quantity: string) => [{ id: plan.id, reserved: "1000000", drawn: quantity }];

  it("is valid when later vesting names the security that holds the remaining shares", () => {
    const context = validate(packageWith(laterAcceleration));

    expect(context.findings).toEqual([]);
    expect(context.result).toBe(VALID);
    expect(context.snapshots.find((snapshot) => snapshot.date === lastDay)).toMatchObject({ stockIssuances: [founderStock, partTimeAward].map(row), stockPlans: drawn("36000") });
    expect(context.snapshots.at(-1)).toMatchObject({ date: leavingDay, stockIssuances: [founderStock, finalShares].map(row), stockPlans: drawn("32000") });
  });

  it("is valid when vesting on the original award is recorded on the day of the partial forfeiture", () => {
    const context = validate([...packageWith(laterAcceleration), { ...acceleration, id: "accelerate-on-part-time-move", date: lastDay }]);

    expect(context.findings).toEqual([]);
    expect(context.result).toBe(VALID);
  });

  it("reports later vesting that still names the original award, and checks the rest of the package", () => {
    const misdirected = { ...laterAcceleration, security_id: award.security_id } satisfies OCFVestingAcceleration;
    const context = validate(packageWith(misdirected));

    expect(context.findings).toEqual([{
      subject: { object_type: "TX_VESTING_ACCELERATION", id: misdirected.id }, check: "no-earlier-removal", severity: "error", outcome: "failed",
      message: `The security ${award.security_id} was removed from the cap table by ${firstForfeiture.id} on ${lastDay}.`,
    }]);
    // The second forfeiture, of the security that holds the remaining shares, is still applied.
    expect(context.snapshots.at(-1)).toMatchObject({ date: leavingDay, stockIssuances: [founderStock, finalShares].map(row), stockPlans: drawn("32000") });
  });
});

// The rule itself, run on each removal's validator with one vesting transaction in the history.
describe.each(endings)("no-other-transactions on $removal.object_type", ({ award: issued, removal }) => {
  const conflicts = (other: Record<string, unknown>) =>
    runValidator(removal.object_type, contextWith({ stockIssuances: [issued], transactions: [issued, other, removal] }), removal)
      .filter((finding) => finding.check === "no-other-transactions");

  it.each([vestingStart, seriesAClosing, acceleration])("allows a $object_type dated before, on or after the transaction", (vesting) => {
    expect(conflicts(vesting)).toEqual([]);
    expect(conflicts({ ...vesting, date: lastDay })).toEqual([]);
    expect(conflicts({ ...vesting, date: "2022-11-15" })).toEqual([]);
  });

  it("reports a transfer of the stock", () => {
    const transfer = { id: "transfer-award", object_type: "TX_STOCK_TRANSFER", security_id: award.security_id, date: "2022-03-01", quantity: "48000", resulting_security_ids: [] };
    expect(conflicts(transfer)).toMatchObject([{ message: `Transaction transfer-award also references stock ${award.security_id}.` }]);
  });
});
