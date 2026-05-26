import { OcfMachineContext } from "../../ocfMachine";

/*
CURRENT CHECKS:
Check that equity_compensation issuance in incoming security_id referenced by transaction exists in current state.
The date of the equity_compensation issuance referred to in the security_id must have a date equal to or earlier than the date of the equity_compensation exercise
Any stock issuances with corresponding security IDs referred to in the resulting_security_ids array must exist
The security_id of the equity_compensation issuance referred to in the security_id variable must not be the security_id related to any other transactions with the exception of a equity_compensation acceptance transaction.
The dates of any equity_compensation issuances referred to in the resulting_security_ids variables must have a date equal to the date of the equity_compensation exercise
The stakeholder_id of the equity_compensation issuance referred to in the security_id variable must equal the stakeholder_id of any stock issuances referred to in the resulting_security_ids variable

NOT IMPLEMENTED:
The quantity_converted variable must equal the sum of any equity_compensation issuances referred to in the resulting_security_ids variable
*/

const valid_tx_equity_compensation_exercise = (context: OcfMachineContext, event: any, isGuard: Boolean) => {
  let validity = false;
  const { transactions } = context.ocfPackageContent;
  let report: any = { transaction_type: "TX_EQUITY_COMPENSATION_EXERCISE", transaction_id: event.data.id, transaction_date: event.data.date };

  // Check that equity_compensation issuance in incoming security_id referenced by transaction exists in current state.
  let incoming_equity_compensationIssuance_validity = false;
  
  context.equityCompensation.forEach((ele: any) => {
    console.log('ele.security_id', ele.security_id);
    console.log('event.data.security_id', event.data.security_id);
    console.log('ele.object_type', ele.object_type);
    if (ele.security_id === event.data.security_id && ele.object_type === "TX_CANONICAL_EQUITY_COMPENSATION_ISSUANCE") {
      incoming_equity_compensationIssuance_validity = true;
      report.incoming_equity_compensationIssuance_validity = true;
    }
  });
  if (!incoming_equity_compensationIssuance_validity) {
    report.incoming_equity_compensationIssuance_validity = false;
  }

  // The date of the equity_compensation issuance referred to in the security_id must have a date equal to or earlier than the date of the equity_compensation exercise
  let incoming_date_validity = false;
  transactions.forEach((ele: any) => {
    if (ele.security_id === event.data.security_id && ele.object_type === "TX_CANONICAL_EQUITY_COMPENSATION_ISSUANCE") {
      if (ele.date <= event.data.date) {
        incoming_date_validity = true;
        report.incoming_date_validity = true;
      }
    }
  });
  if (!incoming_date_validity) {
    report.incoming_date_validity = false;
  }


  if (
    incoming_equity_compensationIssuance_validity &&
    incoming_date_validity
  ) {
    validity = true;
  }

  const result = isGuard ? validity : report;

  return result;
};

export default valid_tx_equity_compensation_exercise;
