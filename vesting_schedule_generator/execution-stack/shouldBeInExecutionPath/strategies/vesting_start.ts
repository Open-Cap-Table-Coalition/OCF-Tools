import { parseISO } from "date-fns";
import { StartGraphNode, TX_Vesting_Start } from "types";
import {
  ShouldBeInExecutionPathStrategy,
  ShouldBeInExecutionPathStrategyConfig,
} from "./strategy";

export class VestingStartShouldBeInExecutionPath extends ShouldBeInExecutionPathStrategy<StartGraphNode> {
  private tx: TX_Vesting_Start | undefined;
  constructor(config: ShouldBeInExecutionPathStrategyConfig<StartGraphNode>) {
    super(config);
    this.tx = this.config.ocfData.vestingStartTransactions.find(
      (tx): tx is TX_Vesting_Start =>
        tx.vesting_condition_id === this.config.node.id
    );
  }

  protected evaluate() {
    return this.tx !== undefined;
  }

  protected determineNodeDate(): Date {
    return parseISO(this.tx!.date);
  }

  execute() {
    const evaluateResult = this.evaluate();

    if (evaluateResult) {
      const nodeDate = this.determineNodeDate();
      this.setTriggeredDate(nodeDate);
    }

    return evaluateResult;
  }
}
