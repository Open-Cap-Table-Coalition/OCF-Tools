import type { StartGraphNode } from "types";
import { CreateInstallmentConfig, CreateInstallmentStrategy } from "./strategy";

export class VestingStartStrategy extends CreateInstallmentStrategy<StartGraphNode> {
  constructor(config: CreateInstallmentConfig<StartGraphNode>) {
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
