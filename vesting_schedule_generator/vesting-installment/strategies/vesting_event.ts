import type { EventGraphNode } from "types";
import { CreateInstallmentConfig, CreateInstallmentStrategy } from "./strategy";

export class VestingEventStrategy extends CreateInstallmentStrategy<EventGraphNode> {
  constructor(config: CreateInstallmentConfig<EventGraphNode>) {
    super(config);
  }

  getInstallments() {
    const sharesVesting = this.getSharesVesting().valueOf();

    if (sharesVesting === 0) return [];

    const installment = this.createInstallment({
      date: this.config.node.triggeredDate!,
      quantity: sharesVesting,
    });
    return [installment];
  }
}
