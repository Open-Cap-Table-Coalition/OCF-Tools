import type { GraphNode } from "types";
import {
  ExecutionStrategy,
  ExecutionStrategyConfig,
} from "./strategies/strategy";
import { VestingAbsoluteExecutionStrategy } from "./strategies/vesting_absolute";
import { VestingEventExecutionStrategy } from "./strategies/vesting_event";
import { VestingRelativeExecutionStrategy } from "./strategies/vesting_relative";
import { VestingStartExecutionStrategy } from "./strategies/vesting_start";

export type IExecutionStrategyFactory = {
  getStrategy<T extends GraphNode>(
    node: T
  ): new (config: ExecutionStrategyConfig<T>) => ExecutionStrategy<T>;
};

export class ExecutionStrategyFactory {
  static getStrategy<T extends GraphNode>(node: T) {
    switch (node.trigger.type) {
      case "VESTING_START_DATE":
        return VestingStartExecutionStrategy as unknown as new (
          config: ExecutionStrategyConfig<T>
        ) => ExecutionStrategy<T>;
      case "VESTING_EVENT":
        return VestingEventExecutionStrategy as unknown as new (
          config: ExecutionStrategyConfig<T>
        ) => ExecutionStrategy<T>;
      case "VESTING_SCHEDULE_ABSOLUTE":
        return VestingAbsoluteExecutionStrategy as unknown as new (
          config: ExecutionStrategyConfig<T>
        ) => ExecutionStrategy<T>;
      case "VESTING_SCHEDULE_RELATIVE":
        return VestingRelativeExecutionStrategy as unknown as new (
          config: ExecutionStrategyConfig<T>
        ) => ExecutionStrategy<T>;
    }
  }
}
