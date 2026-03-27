const valid_tx_plan_security_issuance = (context: any, event: any, isGuard: any) => {
  let validity = false;
  const { stakeholders, stockPlans, transactions } = context.ocfPackageContent;
  let report: any = {transaction_type: "TX_PLAN_SECURITY_ISSUANCE", transaction_id: event.data.id, transaction_date: event.data.date};

  // 1. Check if the stakeholder referenced by the transaction exists in the stakeholder file.
  let stakeholder_validity = false;
  stakeholders.forEach((ele: any) => {
    if (ele.id === event.data.stakeholder_id) {
      stakeholder_validity = true;
      report.stakeholder_validity = true
    }
  });
  if (!stakeholder_validity) {
    report.stakeholder_validity = false
  }

  // 2. Check that the stock plan referenced by the transaction exists.
  let stock_plan_validity = false;
  const stockPlan = stockPlans.find((plan: any) => plan.id === event.data.stock_plan_id);
  if (stockPlan) {
    stock_plan_validity = true;
    report.stock_plan_validity = true;
  } else {
    report.stock_plan_validity = false;
  }

  // 3. Check that the stock plan has a board approval date on or before the issuance date.
  let stock_plan_approval_validity = false;
  if (stockPlan && stockPlan.board_approval_date) {
    if (stockPlan.board_approval_date <= event.data.date) {
      stock_plan_approval_validity = true;
      report.stock_plan_approval_validity = true;
    } else {
      report.stock_plan_approval_validity = false;
    }
  } else {
    report.stock_plan_approval_validity = false;
  }

  // 4. Check that the stock plan has sufficient shares remaining in the pool.
  //    Pool size is determined by `initial_shares_reserved` on the stock plan,
  //    modified by TX_STOCK_PLAN_POOL_ADJUSTMENT events (which set a new absolute total)
  //    and TX_STOCK_PLAN_RETURN_TO_POOL events (which add shares back).
  //    Both TX_PLAN_SECURITY_ISSUANCE and TX_EQUITY_COMPENSATION_ISSUANCE draw from the pool.
  let sufficient_shares_validity = false;
  if (stockPlan) {
    // Determine current pool size: start with initial_shares_reserved,
    // then check for the most recent pool adjustment on or before the issuance date.
    let currentPoolSize = parseFloat(stockPlan.initial_shares_reserved);

    const poolAdjustments = transactions
      .filter((tx: any) =>
        tx.object_type === 'TX_STOCK_PLAN_POOL_ADJUSTMENT' &&
        tx.stock_plan_id === event.data.stock_plan_id &&
        tx.date <= event.data.date
      )
      .sort((a: any, b: any) => a.date.localeCompare(b.date));

    if (poolAdjustments.length > 0) {
      // The most recent adjustment sets the absolute pool size
      currentPoolSize = parseFloat(poolAdjustments[poolAdjustments.length - 1].shares_reserved);
    }

    // Sum shares returned to pool on or before the issuance date
    const sharesReturned = transactions
      .filter((tx: any) =>
        tx.object_type === 'TX_STOCK_PLAN_RETURN_TO_POOL' &&
        tx.stock_plan_id === event.data.stock_plan_id &&
        tx.date <= event.data.date
      )
      .reduce((sum: number, tx: any) => sum + parseFloat(tx.quantity), 0);

    // Sum shares already issued from this plan (both plan security and equity compensation issuances)
    // excluding the current transaction
    const sharesIssued = transactions
      .filter((tx: any) =>
        (tx.object_type === 'TX_PLAN_SECURITY_ISSUANCE' || tx.object_type === 'TX_EQUITY_COMPENSATION_ISSUANCE') &&
        tx.stock_plan_id === event.data.stock_plan_id &&
        tx.date <= event.data.date &&
        tx.id !== event.data.id
      )
      .reduce((sum: number, tx: any) => sum + parseFloat(tx.quantity), 0);

    const availableShares = currentPoolSize - sharesIssued + sharesReturned;
    const requestedShares = parseFloat(event.data.quantity);

    if (availableShares >= requestedShares) {
      sufficient_shares_validity = true;
      report.sufficient_shares_validity = true;
    } else {
      report.sufficient_shares_validity = false;
    }
  } else {
    report.sufficient_shares_validity = false;
  }

  if (
    stakeholder_validity &&
    stock_plan_validity &&
    stock_plan_approval_validity &&
    sufficient_shares_validity
  ) {
    validity = true;
  }

  const result = isGuard ? validity : report;

  return result;
};

export default valid_tx_plan_security_issuance;
