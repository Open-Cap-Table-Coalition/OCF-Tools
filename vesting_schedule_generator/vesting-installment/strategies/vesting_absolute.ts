import type { AbsoluteGraphNode } from "types";
import { CreateInstallmentConfig, CreateInstallmentStrategy } from "./strategy";

export class VestingAbsoluteStrategy extends CreateInstallmentStrategy<AbsoluteGraphNode> {
  constructor(config: CreateInstallmentConfig<AbsoluteGraphNode>) {
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
