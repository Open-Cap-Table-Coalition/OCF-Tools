import { OcfMachineContext } from "./ocfMachine";
import type { Snapshot } from "../types/snapshot";

const RUN_EOD = (context: OcfMachineContext, event: any): Snapshot => {
  let snapshot: Snapshot = {date: event.date, stockIssuances: [], convertibles: [], warrants: [], equityCompensation: []};

  
  context.stockIssuances.forEach((issuance) => {
    snapshot.stockIssuances.push({
            date: issuance.date,
      custom_id: issuance.custom_id,
      stakeholder: issuance.stakeholder_id,
      stock_class: issuance.stock_class_id,
      quantity: issuance.quantity,
    });
  });

  context.convertibleIssuances.forEach((issuance: any) => {
    snapshot.convertibles.push({
        date: issuance.date,
      custom_id: issuance.custom_id,
      stakeholder: issuance.stakeholder_id,
      purchase_price: issuance.purchase_price,
    });
  });

  context.warrantIssuances.forEach((issuance: any) => {
    snapshot.warrants.push({
      date: issuance.date,
      custom_id: issuance.custom_id,
      stakeholder: issuance.stakeholder_id,
      purchase_price: issuance.purchase_price,
    });
  });

  context.equityCompensation.forEach((issuance: any) => {
    snapshot.equityCompensation.push({
      date: issuance.date,
      custom_id: issuance.custom_id,
      stakeholder: issuance.stakeholder_id,
      quantity: issuance.quantity,
    });
  });

  return snapshot;
};

export default RUN_EOD;
