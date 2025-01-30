import type { GraphNode, VestingInstallment, OCFDataBySecurityId } from "types";
import { InstallmentStrategyFactory } from "./factory";

export class VestingInstallmentBuilder {
  private vestingSchedule: VestingInstallment[] = [];
  private vestedCount = 0;
  constructor(
    private ocfData: OCFDataBySecurityId,
    private executionPath: Map<string, GraphNode>
  ) {}

  private addToVestingSchedule(installments: VestingInstallment[]) {
    const totalVested = installments.reduce((acc, installment) => {
      return (acc += installment.quantity);
    }, 0);

    this.vestedCount += totalVested;

    this.vestingSchedule.push(...installments);
  }

  private createInstallments(node: GraphNode) {
    const Strategy = InstallmentStrategyFactory.getStrategy(node);

    const installments = new Strategy({
      node,
      vestedCount: this.vestedCount,
      ocfData: this.ocfData,
      executionPath: this.executionPath,
    }).getInstallments();

    return installments;
  }

  public build() {
    for (const node of this.executionPath.values()) {
      const installments = this.createInstallments(node);
      this.addToVestingSchedule(installments);
    }

    return this.vestingSchedule;
  }
}
