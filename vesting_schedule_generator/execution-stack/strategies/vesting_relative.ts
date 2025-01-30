import { addDays, addMonths, getDate, lastDayOfMonth, setDate } from "date-fns";
import { ExecutionStrategy, ExecutionStrategyConfig } from "./strategy";
import type { Day_Of_Month, GraphNode, RelativeGraphNode } from "types";

export class VestingRelativeExecutionStrategy extends ExecutionStrategy<RelativeGraphNode> {
  private relativeCondition: GraphNode | undefined;
  constructor(config: ExecutionStrategyConfig<RelativeGraphNode>) {
    super(config);
    this.relativeCondition = this.config.executionStack.get(
      this.config.node.trigger.relative_to_condition_id
    );
  }

  protected evaluate() {
    if (!this.relativeCondition) {
      return false;
    }

    if (!this.relativeCondition.triggeredDate) {
      throw new Error(
        `Vesting condition with id ${this.relativeCondition?.id} is in the execution stack but does not have a triggered date`
      );
    }

    return true;
  }

  execute() {
    const result = this.evaluate();

    if (result) {
      const nodeDate = this.determineNodeDate();
      this.setTriggeredDate(nodeDate);
    }

    return result;
  }

  protected determineNodeDate(): Date {
    const baseDay = getDate(this.relativeCondition!.triggeredDate!);
    const baseDate = setDate(this.relativeCondition!.triggeredDate!, baseDay);

    const type = this.config.node.trigger.period.type;
    const length = this.config.node.trigger.period.length;

    let newDate = setDate(baseDate, baseDay);

    let day_of_month: Day_Of_Month;

    if (type === "MONTHS") {
      day_of_month = this.config.node.trigger.period.day_of_month;
      const nextMonthDate = addMonths(baseDate, length);
      const lastDateOfMonth = lastDayOfMonth(nextMonthDate);
      const lastDay = getDate(lastDateOfMonth);
      let targetDay: number;

      switch (day_of_month) {
        case "29_OR_LAST_DAY_OF_MONTH":
          targetDay = Math.min(29, lastDay);
          newDate = setDate(nextMonthDate, targetDay);
        case "30_OR_LAST_DAY_OF_MONTH":
          targetDay = Math.min(30, lastDay);
          newDate = setDate(nextMonthDate, targetDay);
        case "31_OR_LAST_DAY_OF_MONTH":
          targetDay = Math.min(31, lastDay);
          newDate = setDate(nextMonthDate, targetDay);
          break;
        case "VESTING_START_DAY_OR_LAST_DAY_OF_MONTH":
          targetDay = Math.min(baseDay, lastDay);
          newDate = setDate(nextMonthDate, targetDay);
          break;
        default:
          targetDay = baseDay;
          newDate = setDate(nextMonthDate, targetDay);
          break;
      }
    } else if (type === "DAYS") {
      newDate = addDays(baseDate, length);
    }

    return newDate;
  }
}
