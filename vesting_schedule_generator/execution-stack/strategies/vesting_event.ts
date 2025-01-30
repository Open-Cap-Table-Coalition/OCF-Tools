import { parseISO } from "date-fns";
import type { EventGraphNode, TX_Vesting_Event } from "types";
import { ExecutionStrategy, ExecutionStrategyConfig } from "./strategy";

export class VestingEventExecutionStrategy extends ExecutionStrategy<EventGraphNode> {
  private tx: TX_Vesting_Event | undefined;
  constructor(config: ExecutionStrategyConfig<EventGraphNode>) {
    super(config);
    this.tx = this.config.ocfData.vestingEventTransactions.find(
      (tx): tx is TX_Vesting_Event =>
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
