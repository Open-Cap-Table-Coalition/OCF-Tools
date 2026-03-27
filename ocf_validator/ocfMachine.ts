import { assign } from "xstate";
import { OcfPackageContent } from "../read_ocf_package";
import validators from "./validators";
import run_EOD from "./eod";

export type OcfMachineContext = {
  stockIssuances: any[];
  equityCompensation: any[];
  convertibleIssuances: any[];
  warrantIssuances: any[];
  planSecurityIssuances: any[];
  ocfPackageContent: OcfPackageContent;
  report: any[];
  snapshots: any[],
  result : any
};

export type OcfMachineEvent = {
  type: string;
  data: any;
  date: string;
};

export const ocfMachine: any = {
  predictableActionArguments: true,
  id: "OCF-xstate",
  initial: "capTable",
  context: {
    stockIssuances: [],
    equityCompensation: [],
    convertibleIssuances: [],
    warrantIssuances: [],
    planSecurityIssuances: [],
    ocfPackageContent: {},
    report: [],
    snapshots: [],
    result: 'Incomplete'
  },
  states: {
    capTable: {
      on: {
        START: [
          {
            target: "capTable",
            actions: [
              assign({
                ocfPackageContent: ({ event }: {event: OcfMachineEvent }) => event.data,
              }),
            ],
          },
        ],
        TX_STOCK_ISSUANCE: [
          {
            guard: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => {
              return validators.valid_tx_stock_issuance(context, event, true);
            },
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  [...context.report, validators.valid_tx_stock_issuance(context, event, false)]

              }),
              assign({
                stockIssuances: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  [...context.stockIssuances, event.data],
              }),
            ],
            target: "capTable",
          },
          {
            target: "validationError",
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  [...context.report, validators.valid_tx_stock_issuance(context, event, false)]
              }),
              assign({
                result: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  `The validation of the OCF package for ${context.ocfPackageContent.manifest.issuer.legal_name} failed on ${event.data.id}: ${JSON.stringify(validators.valid_tx_stock_issuance(context, event, false),null, 2)}`
              }),
            ],
          },
        ],
        TX_STOCK_RETRACTION: [
          {
            guard: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => {
              return validators.valid_tx_stock_retraction(context, event, true);
            },
            target: 'capTable',
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  [...context.report, validators.valid_tx_stock_issuance(context, event, false)]
              }),
              assign({
                stockIssuances: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  context.stockIssuances.filter((obj: any) => { return obj.security_id !== event.data.security_id; }
                  ),
              }),

            ],
          },
          {
            target: "validationError",
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  [...context.report, validators.valid_tx_stock_retraction(context, event, false)]
              }),
              assign({
                result: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  `The validation of the OCF package for ${context.ocfPackageContent.manifest.issuer.legal_name} failed on ${event.data.id}: ${JSON.stringify(validators.valid_tx_stock_retraction(context, event, false),null, 2)}`
              }),
            ],
          },
        ],
        TX_STOCK_ACCEPTANCE: [
          {
            guard: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => {
              return validators.valid_tx_stock_acceptance(context, event, true);
            },
            target: 'capTable',
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  [...context.report, validators.valid_tx_stock_acceptance(context, event, false)]
              }),
            ],
          },
          {
            target: "validationError",
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  [...context.report, validators.valid_tx_stock_acceptance(context, event, false)]
              }),
              assign({
                result: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  `The validation of the OCF package for ${context.ocfPackageContent.manifest.issuer.legal_name} failed on ${event.data.id}: ${JSON.stringify(validators.valid_tx_stock_acceptance(context, event, false),null, 2)}`
              }),
            ],
          },
        ],
        TX_STOCK_CANCELLATION: [
          {
            guard: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => {
              return validators.valid_tx_stock_cancellation(context, event, true);
            },
            target: 'capTable',
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  [...context.report, validators.valid_tx_stock_cancellation(context, event, false)]
              }),
              assign({
                stockIssuances: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  context.stockIssuances.filter((obj: any) => { return obj.security_id !== event.data.security_id; }
                  ),
              }),

            ],
          },
          {
            target: "validationError",
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  [...context.report, validators.valid_tx_stock_cancellation(context, event, false)]
              }),
              assign({
                result: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  `The validation of the OCF package for ${context.ocfPackageContent.manifest.issuer.legal_name} failed on ${event.data.id}: ${JSON.stringify(validators.valid_tx_stock_cancellation(context, event, false),null, 2)}`  
              }),
            ],
          },
        ], 
        TX_STOCK_TRANSFER: [
          {
            guard: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => {
              return validators.valid_tx_stock_transfer(context, event, true);
            },
            target: 'capTable',
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  [...context.report, validators.valid_tx_stock_transfer(context, event, false)]
              }),
              assign({
                stockIssuances: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  context.stockIssuances.filter((obj: any) => { return obj.security_id !== event.data.security_id; }
                  ),
              }),

            ],
          },
          {
            target: "validationError",
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  [...context.report, validators.valid_tx_stock_transfer(context, event, false)]
              }),
              assign({
                result: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  `The validation of the OCF package for ${context.ocfPackageContent.manifest.issuer.legal_name} failed on ${event.data.id}: ${JSON.stringify(validators.valid_tx_stock_transfer(context, event, false),null, 2)}`
              }),
            ],
          },
        ],
        TX_STOCK_CONVERSION: [
          {
            guard: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => {
              return validators.valid_tx_stock_conversion(context, event, true);
            },
            target: 'capTable',
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  [...context.report, validators.valid_tx_stock_conversion(context, event, false)]
              }),
              assign({
                stockIssuances: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  context.stockIssuances.filter((obj: any) => { return obj.security_id !== event.data.security_id; }
                  ),
              }),

            ],
          },
          {
            target: "validationError",
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  [...context.report, validators.valid_tx_stock_conversion(context, event, false)]
              }),
              assign({
                result: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  `The validation of the OCF package for ${context.ocfPackageContent.manifest.issuer.legal_name} failed on ${event.data.id}: ${JSON.stringify(validators.valid_tx_stock_conversion(context, event, false),null, 2)}`
              }),
            ],
          },
        ],
        TX_STOCK_REISSUANCE: [
          {
            guard: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => {
              return validators.valid_tx_stock_reissuance(context, event, true);
            },
            target: 'capTable',
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  [...context.report, validators.valid_tx_stock_reissuance(context, event, false)]
              }),
              assign({
                stockIssuances: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  context.stockIssuances.filter((obj: any) => { return obj.security_id !== event.data.security_id; }
                  ),
              }),

            ],
          },
          {
            target: "validationError",
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  [...context.report, validators.valid_tx_stock_reissuance(context, event, false)]
              }),
              assign({
                result: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  `The validation of the OCF package for ${context.ocfPackageContent.manifest.issuer.legal_name} failed on ${event.data.id}: ${JSON.stringify(validators.valid_tx_stock_reissuance(context, event, false),null, 2)}`
              }),
            ],
          },
        ],
        TX_STOCK_REPURCHASE: [
          {
            guard: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => {
              return validators.valid_tx_stock_repurchase(context, event, true);
            },
            target: 'capTable',
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  [...context.report, validators.valid_tx_stock_repurchase(context, event, false)]
              }),
              assign({
                stockIssuances: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  context.stockIssuances.filter((obj: any) => { return obj.security_id !== event.data.security_id; }
                  ),
              }),

            ],
          },
          {
            target: "validationError",
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  [...context.report, validators.valid_tx_stock_repurchase(context, event, false)]
              }),
              assign({
                result: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  `The validation of the OCF package for ${context.ocfPackageContent.manifest.issuer.legal_name} failed on ${event.data.id}: ${JSON.stringify(validators.valid_tx_stock_repurchase(context, event, false),null, 2)}`
              }),
            ],
          },
        ],
        TX_CONVERTIBLE_ISSUANCE: [
          {
            guard: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => {
              return validators.valid_tx_convertible_issuance(context, event, true);
            },
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  [...context.report, validators.valid_tx_convertible_issuance(context, event, false)]

              }),
              assign({
                convertibleIssuances: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  [...context.convertibleIssuances, event.data],
              }),
            ],
            target: "capTable",
          },
          {
            target: "validationError",
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  [...context.report, validators.valid_tx_convertible_issuance(context, event, false)]
              }),
              assign({
                result: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  `The validation of the OCF package for ${context.ocfPackageContent.manifest.issuer.legal_name} failed on ${event.data.id}: ${JSON.stringify(validators.valid_tx_convertible_issuance(context, event, false),null, 2)}`
              }),
            ],
          },
        ],
        TX_CONVERTIBLE_RETRACTION: [
          {
            guard: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => {
              return validators.valid_tx_convertible_retraction(context, event, true);
            },
            target: 'capTable',
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  [...context.report, validators.valid_tx_convertible_retraction(context, event, false)]
              }),
              assign({
                convertibleIssuances: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  context.convertibleIssuances.filter((obj: any) => { return obj.security_id !== event.data.security_id; }
                  ),
              }),

            ],
          },
          {
            target: "validationError",
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  [...context.report, validators.valid_tx_convertible_retraction(context, event, false)]
              }),
              assign({
                result: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  `The validation of the OCF package for ${context.ocfPackageContent.manifest.issuer.legal_name} failed on ${event.data.id}: ${JSON.stringify(validators.valid_tx_convertible_retraction(context, event, false),null, 2)}`
              }),
            ],
          },
        ],
        TX_CONVERTIBLE_ACCEPTANCE: [
          {
            guard: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => {
              return validators.valid_tx_convertible_acceptance(context, event, true);
            },
            target: 'capTable',
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  [...context.report, validators.valid_tx_convertible_acceptance(context, event, false)]
              }),
            ],
          },
          {
            target: "validationError",
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  [...context.report, validators.valid_tx_convertible_acceptance(context, event, false)]
              }),
              assign({
                result: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  `The validation of the OCF package for ${context.ocfPackageContent.manifest.issuer.legal_name} failed on ${event.data.id}: ${JSON.stringify(validators.valid_tx_convertible_acceptance(context, event, false),null, 2)}`
              }),
            ],
          },
        ],
        TX_CONVERTIBLE_CANCELLATION: [
          {
            guard: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => {
              return validators.valid_tx_convertible_cancellation(context, event, true);
            },
            target: 'capTable',
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  [...context.report, validators.valid_tx_convertible_cancellation(context, event, false)]
              }),
              assign({
                convertibleIssuances: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  context.convertibleIssuances.filter((obj: any) => { return obj.security_id !== event.data.security_id; }
                  ),
              }),

            ],
          },
          {
            target: "validationError",
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  [...context.report, validators.valid_tx_convertible_cancellation(context, event, false)]
              }),
              assign({
                result: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  `The validation of the OCF package for ${context.ocfPackageContent.manifest.issuer.legal_name} failed on ${event.data.id}: ${JSON.stringify(validators.valid_tx_convertible_cancellation(context, event, false),null, 2)}`  
              }),
            ],
          },
        ], 
        TX_CONVERTIBLE_TRANSFER: [
          {
            guard: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => {
              return validators.valid_tx_convertible_transfer(context, event, true);
            },
            target: 'capTable',
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  [...context.report, validators.valid_tx_convertible_transfer(context, event, false)]
              }),
              assign({
                convertibleIssuances: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  context.convertibleIssuances.filter((obj: any) => { return obj.security_id !== event.data.security_id; }
                  ),
              }),

            ],
          },
          {
            target: "validationError",
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  [...context.report, validators.valid_tx_convertible_transfer(context, event, false)]
              }),
              assign({
                result: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  `The validation of the OCF package for ${context.ocfPackageContent.manifest.issuer.legal_name} failed on ${event.data.id}: ${JSON.stringify(validators.valid_tx_convertible_transfer(context, event, false),null, 2)}`
              }),
            ],
          },
        ],
        TX_CONVERTIBLE_CONVERSION: [
          {
            guard: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => {
              return validators.valid_tx_convertible_conversion(context, event, true);
            },
            target: 'capTable',
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  [...context.report, validators.valid_tx_convertible_conversion(context, event, false)]
              }),
              assign({
                convertibleIssuances: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  context.convertibleIssuances.filter((obj: any) => { return obj.security_id !== event.data.security_id; }
                  ),
              }),

            ],
          },
          {
            target: "validationError",
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  [...context.report, validators.valid_tx_convertible_conversion(context, event, false)]
              }),
              assign({
                result: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  `The validation of the OCF package for ${context.ocfPackageContent.manifest.issuer.legal_name} failed on ${event.data.id}: ${JSON.stringify(validators.valid_tx_convertible_conversion(context, event, false),null, 2)}`
              }),
            ],
          },
        ],
        TX_WARRANT_ISSUANCE: [
          {
            guard: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => {
              return validators.valid_tx_warrant_issuance(context, event, true);
            },
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  [...context.report, validators.valid_tx_warrant_issuance(context, event, false)]

              }),
              assign({
                warrantIssuances: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  [...context.convertibleIssuances, event.data],
              }),
            ],
            target: "capTable",
          },
          {
            target: "validationError",
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  [...context.report, validators.valid_tx_warrant_issuance(context, event, false)]
              }),
              assign({
                result: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  `The validation of the OCF package for ${context.ocfPackageContent.manifest.issuer.legal_name} failed on ${event.data.id}: ${JSON.stringify(validators.valid_tx_warrant_issuance(context, event, false),null, 2)}`
              }),
            ],
          },
        ],
        TX_WARRANT_RETRACTION: [
          {
            guard: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => {
              return validators.valid_tx_warrant_retraction(context, event, true);
            },
            target: 'capTable',
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  [...context.report, validators.valid_tx_warrant_retraction(context, event, false)]
              }),
              assign({
                warrantIssuances: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  context.warrantIssuances.filter((obj: any) => { return obj.security_id !== event.data.security_id; }
                  ),
              }),

            ],
          },
          {
            target: "validationError",
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  [...context.report, validators.valid_tx_warrant_retraction(context, event, false)]
              }),
              assign({
                result: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  `The validation of the OCF package for ${context.ocfPackageContent.manifest.issuer.legal_name} failed on ${event.data.id}: ${JSON.stringify(validators.valid_tx_warrant_retraction(context, event, false),null, 2)}`
              }),
            ],
          },
        ],
        TX_WARRANT_ACCEPTANCE: [
          {
            guard: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => {
              return validators.valid_tx_warrant_acceptance(context, event, true);
            },
            target: 'capTable',
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  [...context.report, validators.valid_tx_warrant_acceptance(context, event, false)]
              }),
            ],
          },
          {
            target: "validationError",
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  [...context.report, validators.valid_tx_warrant_acceptance(context, event, false)]
              }),
              assign({
                result: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  `The validation of the OCF package for ${context.ocfPackageContent.manifest.issuer.legal_name} failed on ${event.data.id}: ${JSON.stringify(validators.valid_tx_warrant_acceptance(context, event, false),null, 2)}`
              }),
            ],
          },
        ],
        TX_WARRANT_CANCELLATION: [
          {
            guard: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => {
              return validators.valid_tx_warrant_cancellation(context, event, true);
            },
            target: 'capTable',
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  [...context.report, validators.valid_tx_warrant_cancellation(context, event, false)]
              }),
              assign({
                warrantIssuances: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  context.warrantIssuances.filter((obj: any) => { return obj.security_id !== event.data.security_id; }
                  ),
              }),

            ],
          },
          {
            target: "validationError",
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  [...context.report, validators.valid_tx_warrant_cancellation(context, event, false)]
              }),
              assign({
                result: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  `The validation of the OCF package for ${context.ocfPackageContent.manifest.issuer.legal_name} failed on ${event.data.id}: ${JSON.stringify(validators.valid_tx_warrant_cancellation(context, event, false),null, 2)}`  
              }),
            ],
          },
        ], 
        TX_WARRANT_TRANSFER: [
          {
            guard: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => {
              return validators.valid_tx_warrant_transfer(context, event, true);
            },
            target: 'capTable',
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  [...context.report, validators.valid_tx_warrant_transfer(context, event, false)]
              }),
              assign({
                warrantIssuances: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  context.warrantIssuances.filter((obj: any) => { return obj.security_id !== event.data.security_id; }
                  ),
              }),

            ],
          },
          {
            target: "validationError",
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  [...context.report, validators.valid_tx_warrant_transfer(context, event, false)]
              }),
              assign({
                result: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  `The validation of the OCF package for ${context.ocfPackageContent.manifest.issuer.legal_name} failed on ${event.data.id}: ${JSON.stringify(validators.valid_tx_warrant_transfer(context, event, false),null, 2)}`
              }),
            ],
          },
        ],
        TX_WARRANT_EXERCISE: [
          {
            guard: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => {
              return validators.valid_tx_warrant_exercise(context, event, true);
            },
            target: 'capTable',
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  [...context.report, validators.valid_tx_warrant_exercise(context, event, false)]
              }),
              assign({
                warrantIssuances: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  context.warrantIssuances.filter((obj: any) => { return obj.security_id !== event.data.security_id; }
                  ),
              }),

            ],
          },
          {
            target: "validationError",
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  [...context.report, validators.valid_tx_warrant_exercise(context, event, false)]
              }),
              assign({
                result: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  `The validation of the OCF package for ${context.ocfPackageContent.manifest.issuer.legal_name} failed on ${event.data.id}: ${JSON.stringify(validators.valid_tx_warrant_exercise(context, event, false),null, 2)}`
              }),
            ],
          },
        ],
        TX_EQUITY_COMPENSATION_ISSUANCE: [
          {
            guard: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => {
              return validators.valid_tx_equity_compensation_issuance(context, event, true);
            },
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  [...context.report, validators.valid_tx_equity_compensation_issuance(context, event, false)]

              }),
              assign({
                equityCompensation: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  [...context.equityCompensation, event.data],
              }),
            ],
            target: "capTable",
          },
          {
            target: "validationError",
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  [...context.report, validators.valid_tx_equity_compensation_issuance(context, event, false)]
              }),
              assign({
                result: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  `The validation of the OCF package for ${context.ocfPackageContent.manifest.issuer.legal_name} failed on ${event.data.id}: ${JSON.stringify(validators.valid_tx_equity_compensation_issuance(context, event, false),null, 2)}`
              }),
            ],
          },
        ],
        TX_EQUITY_COMPENSATION_RETRACTION: [
          {
            guard: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => {
              return validators.valid_tx_equity_compensation_retraction(context, event, true);
            },
            target: 'capTable',
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  [...context.report, validators.valid_tx_equity_compensation_retraction(context, event, false)]
              }),
              assign({
                equityCompensation: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  context.equityCompensation.filter((obj: any) => { return obj.security_id !== event.data.security_id; }
                  ),
              }),

            ],
          },
          {
            target: "validationError",
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  [...context.report, validators.valid_tx_equity_compensation_retraction(context, event, false)]
              }),
              assign({
                result: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  `The validation of the OCF package for ${context.ocfPackageContent.manifest.issuer.legal_name} failed on ${event.data.id}: ${JSON.stringify(validators.valid_tx_equity_compensation_retraction(context, event, false),null, 2)}`
              }),
            ],
          },
        ],
        TX_EQUITY_COMPENSATION_ACCEPTANCE: [
          {
            guard: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => {
              return validators.valid_tx_equity_compensation_acceptance(context, event, true);
            },
            target: 'capTable',
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  [...context.report, validators.valid_tx_equity_compensation_acceptance(context, event, false)]
              }),
            ],
          },
          {
            target: "validationError",
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  [...context.report, validators.valid_tx_equity_compensation_acceptance(context, event, false)]
              }),
              assign({
                result: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  `The validation of the OCF package for ${context.ocfPackageContent.manifest.issuer.legal_name} failed on ${event.data.id}: ${JSON.stringify(validators.valid_tx_equity_compensation_acceptance(context, event, false),null, 2)}`
              }),
            ],
          },
        ],
        TX_EQUITY_COMPENSATION_CANCELLATION: [
          {
            guard: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => {
              return validators.valid_tx_equity_compensation_cancellation(context, event, true);
            },
            target: 'capTable',
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  [...context.report, validators.valid_tx_equity_compensation_cancellation(context, event, false)]
              }),
              assign({
                equityCompensation: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  context.equityCompensation.filter((obj: any) => { return obj.security_id !== event.data.security_id; }
                  ),
              }),

            ],
          },
          {
            target: "validationError",
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  [...context.report, validators.valid_tx_equity_compensation_cancellation(context, event, false)]
              }),
              assign({
                result: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  `The validation of the OCF package for ${context.ocfPackageContent.manifest.issuer.legal_name} failed on ${event.data.id}: ${JSON.stringify(validators.valid_tx_equity_compensation_cancellation(context, event, false),null, 2)}`  
              }),
            ],
          },
        ], 
        TX_EQUITY_COMPENSATION_TRANSFER: [
          {
            guard: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => {
              return validators.valid_tx_equity_compensation_transfer(context, event, true);
            },
            target: 'capTable',
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  [...context.report, validators.valid_tx_equity_compensation_transfer(context, event, false)]
              }),
              assign({
                equityCompensation: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  context.equityCompensation.filter((obj: any) => { return obj.security_id !== event.data.security_id; }
                  ),
              }),

            ],
          },
          {
            target: "validationError",
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  [...context.report, validators.valid_tx_equity_compensation_transfer(context, event, false)]
              }),
              assign({
                result: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  `The validation of the OCF package for ${context.ocfPackageContent.manifest.issuer.legal_name} failed on ${event.data.id}: ${JSON.stringify(validators.valid_tx_equity_compensation_transfer(context, event, false),null, 2)}`
              }),
            ],
          },
        ],
        TX_EQUITY_COMPENSATION_EXERCISE: [
          {
            guard: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => {
              return validators.valid_tx_equity_compensation_exercise(context, event, true);
            },
            target: 'capTable',
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                  [...context.report, validators.valid_tx_equity_compensation_exercise(context, event, false)]
              }),
              // assign({
              //   equityCompensation: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
              //     context.equityCompensation.filter((obj: any) => { return obj.security_id !== event.data.security_id; }
              //     ),
              // }),

            ],
          },
          {
            target: "validationError",
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  [...context.report, validators.valid_tx_equity_compensation_exercise(context, event, false)]
              }),
              assign({
                result: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  `The validation of the OCF package for ${context.ocfPackageContent.manifest.issuer.legal_name} failed on ${event.data.id}: ${JSON.stringify(validators.valid_tx_equity_compensation_exercise(context, event, false),null, 2)}`
              }),
            ],
          },
        ],
        TX_PLAN_SECURITY_ISSUANCE: [
          {
            guard: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => {
              return validators.valid_tx_plan_security_issuance(context, event, true);
            },
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  [...context.report, validators.valid_tx_plan_security_issuance(context, event, false)]

              }),
              assign({
                planSecurityIssuances: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  [...context.planSecurityIssuances, event.data],
              }),
            ],
            target: "capTable",
          },
          {
            target: "validationError",
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  [...context.report, validators.valid_tx_plan_security_issuance(context, event, false)]
              }),
              assign({
                result: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  `The validation of the OCF package for ${context.ocfPackageContent.manifest.issuer.legal_name} failed on ${event.data.id}: ${JSON.stringify(validators.valid_tx_plan_security_issuance(context, event, false),null, 2)}`
              }),
            ],
          },
        ],
        TX_PLAN_SECURITY_ACCEPTANCE: [
          {
            guard: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => {
              return validators.valid_tx_plan_security_acceptance(context, event, true);
            },
            target: 'capTable',
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  [...context.report, validators.valid_tx_plan_security_acceptance(context, event, false)]
              }),
            ],
          },
          {
            target: "validationError",
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  [...context.report, validators.valid_tx_plan_security_acceptance(context, event, false)]
              }),
              assign({
                result: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  `The validation of the OCF package for ${context.ocfPackageContent.manifest.issuer.legal_name} failed on ${event.data.id}: ${JSON.stringify(validators.valid_tx_plan_security_acceptance(context, event, false),null, 2)}`
              }),
            ],
          },
        ],
        TX_PLAN_SECURITY_RETRACTION: [
          {
            guard: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => {
              return validators.valid_tx_plan_security_retraction(context, event, true);
            },
            target: 'capTable',
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  [...context.report, validators.valid_tx_plan_security_retraction(context, event, false)]
              }),
              assign({
                planSecurityIssuances: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  context.planSecurityIssuances.filter((obj: any) => { return obj.security_id !== event.data.security_id; }
                  ),
              }),

            ],
          },
          {
            target: "validationError",
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  [...context.report, validators.valid_tx_plan_security_retraction(context, event, false)]
              }),
              assign({
                result: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  `The validation of the OCF package for ${context.ocfPackageContent.manifest.issuer.legal_name} failed on ${event.data.id}: ${JSON.stringify(validators.valid_tx_plan_security_retraction(context, event, false),null, 2)}`
              }),
            ],
          },
        ],
        TX_PLAN_SECURITY_CANCELLATION: [
          {
            guard: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => {
              return validators.valid_tx_plan_security_cancellation(context, event, true);
            },
            target: 'capTable',
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  [...context.report, validators.valid_tx_plan_security_cancellation(context, event, false)]
              }),
              assign({
                planSecurityIssuances: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  context.planSecurityIssuances.filter((obj: any) => { return obj.security_id !== event.data.security_id; }
                  ),
              }),

            ],
          },
          {
            target: "validationError",
            actions: [
              assign({
                report: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  [...context.report, validators.valid_tx_plan_security_cancellation(context, event, false)]
              }),
              assign({
                result: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) =>
                  `The validation of the OCF package for ${context.ocfPackageContent.manifest.issuer.legal_name} failed on ${event.data.id}: ${JSON.stringify(validators.valid_tx_plan_security_cancellation(context, event, false),null, 2)}`
              }),
            ],
          },
        ],
        INVALID_TX: [
          {
            target: "validationError",
            actions: assign({
              result: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
                `The validation of the OCF package for ${context.ocfPackageContent.manifest.issuer.legal_name} failed on ${event.data.id} because it is not a valid TX type.`
            }),
          },
        ],
        RUN_EOD: {
          taget: "capTable",
          actions: assign({
            snapshots: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => 
              [...context.snapshots, run_EOD(context, event)]
          }),
        },
        RUN_END: {
          taget: "capTable",
          actions: [
          assign ({
            result: ({ context, event }: { context: OcfMachineContext; event: OcfMachineEvent }) => `The validation of the OCF package for ${context.ocfPackageContent.manifest.issuer.legal_name} is complete and the package appears valid.`
          })
        ] 
        },
      },
    },
    validationError: {
      type: "final",
    },
  },
};
