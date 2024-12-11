import { max } from "date-fns";
import type { GraphNode, OCFDataBySecurityId } from "types";

export interface ShouldBeInExecutionPathStrategyConfig<T extends GraphNode> {
  node: T;
  graph: Map<string, GraphNode>;
  executionStack: Map<string, GraphNode>;
  ocfData: OCFDataBySecurityId;
}

export abstract class ShouldBeInExecutionPathStrategy<T extends GraphNode> {
  protected config: ShouldBeInExecutionPathStrategyConfig<T>;
  protected parentNodes: GraphNode[];
  constructor(config: ShouldBeInExecutionPathStrategyConfig<T>) {
    this.config = config;
    this.parentNodes = this.getParentNodes();
  }

  /**
   * Evaluates whether the node should be in the execution path.
   */
  protected abstract evaluate(): boolean;

  /**
   * Returns the result of the evaluate method and sets the node's triggered date if the evaluate method resolves to true.
   */
  abstract execute(): boolean;

  // protected createIssue(config: {
  //   id: string;
  //   message: string;
  //   severity: "ERROR" | "WARNING";
  // }) {
  //   const issue = new VestingScheduleIssue(config);
  //   this.config.issues.push(issue);
  // }

  private getParentNodes() {
    const priorConditionIds = this.config.node.prior_condition_ids;
    const parentNodes = priorConditionIds.reduce((acc, priorConditionId) => {
      const priorCondition = this.config.graph.get(priorConditionId);
      if (priorCondition) {
        acc.push(priorCondition);
      }
      return acc;
    }, [] as GraphNode[]);

    return parentNodes;
  }

  /**
   * Determines the triggered date for the node based on its own trigger type.
   * Only called if the evaluate method resolves to true.
   * Will be compared against the triggered dates of the nodes's parents in the setTriggeredDate method
   */
  protected abstract determineNodeDate(): Date;

  /**
   * Determines the triggered dates of all parent nodes
   * @returns Date[]
   */
  protected determineParentNodeDates() {
    if (this.parentNodes.length === 0) {
      return null;
    }

    const parentDates = [...this.parentNodes].reduce((acc, parentNode) => {
      if (!parentNode.triggeredDate) {
        return acc;
      }

      acc.push(parentNode.triggeredDate);
      return acc;
    }, [] as Date[]);

    return parentDates;
  }

  /**
   * Determines the latest triggered date of this node's parents.
   * @returns Date
   */
  protected determineLatestParentDate() {
    const parentDates = this.determineParentNodeDates();

    if (parentDates === null) {
      return null;
    }

    return max(parentDates);
  }

  /**
   * Sets this node's triggered date as the later of its own triggered date and those of its parents.
   * @param nodeDate
   */
  protected setTriggeredDate(nodeDate: Date) {
    const latestParentDate = this.determineLatestParentDate();
    if (latestParentDate) {
      const latestDate = max([latestParentDate, nodeDate]);
      this.config.node.triggeredDate = latestDate;
      return;
    }
    this.config.node.triggeredDate = nodeDate;
    return;
  }
}
