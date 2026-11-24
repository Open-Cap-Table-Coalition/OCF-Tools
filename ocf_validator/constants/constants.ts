import type { TxKey } from "../validators";

/** A transaction type under the name OCF uses for it today. */
export type CurrentTxKey = Exclude<TxKey, `TX_PLAN_SECURITY_${string}`>;

export const OLDER_NAMES = {
  TX_PLAN_SECURITY_ISSUANCE: "TX_EQUITY_COMPENSATION_ISSUANCE",
  TX_PLAN_SECURITY_ACCEPTANCE: "TX_EQUITY_COMPENSATION_ACCEPTANCE",
  TX_PLAN_SECURITY_EXERCISE: "TX_EQUITY_COMPENSATION_EXERCISE",
  TX_PLAN_SECURITY_RELEASE: "TX_EQUITY_COMPENSATION_RELEASE",
  TX_PLAN_SECURITY_RETRACTION: "TX_EQUITY_COMPENSATION_RETRACTION",
  TX_PLAN_SECURITY_CANCELLATION: "TX_EQUITY_COMPENSATION_CANCELLATION",
  TX_PLAN_SECURITY_TRANSFER: "TX_EQUITY_COMPENSATION_TRANSFER",
} as const satisfies Record<Extract<TxKey, `TX_PLAN_SECURITY_${string}`>, CurrentTxKey>;

export function currentName(type: string): string;
export function currentName(type: unknown): unknown;
export function currentName(type: unknown): unknown {
  return typeof type === "string" && Object.hasOwn(OLDER_NAMES, type) ? OLDER_NAMES[type as keyof typeof OLDER_NAMES] : type;
}
