import { GraphNode } from "types";

/**
 * Creates a directed graph representing vesting conditions.
 * Each node represents a vesting condition, and edges represent the vesting conditions
 * in the next_condition_ids array.
 */
export const createVestingGraph = (graphNodes: GraphNode[]) => {
  // Create the array of GraphNodes into a Map for O(1) lookup
  // This graph represents the directed acyclical vesting graph
  const graph = new Map(graphNodes.map((node) => [node.id, node]));

  // Calculate how many other vesting conditions point to each vesting condition
  const inDegree = new Map<string, number>();
  for (const node of graph.values()) {
    inDegree.set(node.id, 0);
  }
  for (const node of graph.values()) {
    for (const nextConditionId of node.next_condition_ids) {
      inDegree.set(nextConditionId, (inDegree.get(nextConditionId) || 0) + 1);
    }
  }

  // Find starting conditions (nodes with no predecessors)
  const rootNodes = Array.from(inDegree.entries())
    .filter(([_, degree]) => degree === 0)
    .map(([nodeId]) => nodeId);

  if (rootNodes.length === 0) {
    throw new Error(
      `The graph must have at least one starting condition with no prior conditions`
    );
  }

  // Populate the prior_condition_ids array
  // by processing the nodes in depth-first order
  const stack = [...rootNodes];

  while (stack.length > 0) {
    const currentNodeId = stack.pop()!;
    const currentNode = graph.get(currentNodeId);
    if (!currentNode) {
      throw new Error(
        `Vesting condition with id ${currentNodeId} does not exist`
      );
    }

    for (const nextConditionId of currentNode.next_condition_ids) {
      const nextCondition = graph.get(nextConditionId);
      if (!nextCondition) {
        throw new Error(
          `Vesting condition with id ${nextConditionId} does not exist`
        );
      }

      // Add the current node as a predecessor of the next node
      nextCondition.prior_condition_ids.push(currentNode.id);

      // Reduce the in-degree and push to the stack if it becomes 0
      inDegree.set(nextConditionId, (inDegree.get(nextConditionId) || 1) - 1);
      if (inDegree.get(nextConditionId) === 0) {
        stack.push(nextConditionId);
      }
    }
  }

  return { graph, rootNodes };
};
