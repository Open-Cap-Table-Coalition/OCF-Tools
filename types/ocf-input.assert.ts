/**
 * Compile-time assertions for the boundary types. No runtime — this file is
 * type-checked by `tsc` (the build) because it is not a `*.test.ts` file, so a
 * broken invariant fails the build. Covers acceptance criteria B2 (ocf_version
 * widening) and B3 (TransactionFor mapping) until a test runner is settled.
 */
import type { InputManifest, TransactionFor } from "./ocf-input";
import type {
  OCFManifestFile,
  OCFPlanSecurityIssuance,
  OCFEquityCompensationIssuance,
  OCFStockIssuance,
} from "@opencaptablecoalition/ocf-types";
import type { Expect, Equal } from "./type-assert";

// B2: InputManifest widens ocf_version to a free string...
type _WidensVersion = Expect<Equal<InputManifest["ocf_version"], string>>;
// ...while the generated type stays literal-pinned (NOT widened to string).
type _GeneratedStaysPinned = Expect<
  Equal<string extends OCFManifestFile["ocf_version"] ? true : false, false>
>;

// B3: TransactionFor resolves both legacy and current discriminants to the
// correct concrete type — legacy to its narrowed wrapper, current to the parent.
type _Legacy = Expect<
  Equal<TransactionFor<"TX_PLAN_SECURITY_ISSUANCE">, OCFPlanSecurityIssuance>
>;
type _Current = Expect<
  Equal<
    TransactionFor<"TX_EQUITY_COMPENSATION_ISSUANCE">,
    OCFEquityCompensationIssuance
  >
>;
type _Plain = Expect<
  Equal<TransactionFor<"TX_STOCK_ISSUANCE">, OCFStockIssuance>
>;
