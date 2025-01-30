import type { GraphNode } from "types";
import {
  CreateInstallmentConfig,
  CreateInstallmentStrategy,
} from "./strategies/strategy";
import { VestingAbsoluteStrategy } from "./strategies/vesting_absolute";
import { VestingEventStrategy } from "./strategies/vesting_event";
import { VestingRelativeStrategy } from "./strategies/vesting_relative";
import { VestingStartStrategy } from "./strategies/vesting_start";

export class InstallmentStrategyFactory {
  static getStrategy<T extends GraphNode>(node: T) {
    switch (node.trigger.type) {
      case "VESTING_START_DATE":
        return VestingStartStrategy as unknown as new (
          config: CreateInstallmentConfig<T>
        ) => CreateInstallmentStrategy<T>;
      case "VESTING_EVENT":
        return VestingEventStrategy as unknown as new (
          config: CreateInstallmentConfig<T>
        ) => CreateInstallmentStrategy<T>;
      case "VESTING_SCHEDULE_ABSOLUTE":
        return VestingAbsoluteStrategy as unknown as new (
          config: CreateInstallmentConfig<T>
        ) => CreateInstallmentStrategy<T>;
      case "VESTING_SCHEDULE_RELATIVE":
        return VestingRelativeStrategy as unknown as new (
          config: CreateInstallmentConfig<T>
        ) => CreateInstallmentStrategy<T>;
    }
  }
}
