import { OcfPackageContent } from "../read_ocf_package";
import { getOCFDataBySecurityId } from "./get-ocf-data-by-security-id.ts";
import { createVestingGraph } from "./execution-stack/create-vesting-graph.ts";
import {
  GraphNode,
  OCFDataBySecurityId,
  VestingInstallment,
  VestingScheduleStatus,
} from "types/index.ts";
import { compareAsc, parseISO } from "date-fns";
import { VestingInstallmentBuilder } from "./create_installment/VestingInstallmentBuilder.ts";
import { ExecutionStackBuilder } from "./execution-stack/ExecutionStackBuilder.ts";
import { IExecutionStrategyFactory } from "./execution-stack/factory.ts";

export class VestingScheduleGenerator {
  constructor(
    private ocfPackage: OcfPackageContent,
    private executionStackBuilder: new (
      graph: Map<string, GraphNode>,
      rootNodes: string[],
      ocfData: OCFDataBySecurityId,
      executionPathStrategyFactory: IExecutionStrategyFactory
    ) => ExecutionStackBuilder,
    private executionPathStrategyFactory: IExecutionStrategyFactory
  ) {}

  private getOCFData(securityId: string): OCFDataBySecurityId {
    return getOCFDataBySecurityId(this.ocfPackage, securityId);
  }

  /**
   * If both `vesting_terms_id` and `vestings` are provided, defer to the `vesting_terms_id`.
   * Absence of both `vesting_terms_id` and `vestings` means the shares are fully vested on issuance.
   */
  private getStrategy(OCFDataBySecurityId: OCFDataBySecurityId) {
    if (OCFDataBySecurityId.issuanceVestingTerms) {
      return this.imperativeStrategy(OCFDataBySecurityId);
    } else if (OCFDataBySecurityId.vestingObjects) {
      return this.declarativeStrategy(OCFDataBySecurityId);
    } else {
      return this.fullyVestedStrategy(OCFDataBySecurityId);
    }
  }

  private imperativeStrategy(OCFDataBySecurityId: OCFDataBySecurityId) {
    // Prepare vesting conditions
    const vestingConditions =
      OCFDataBySecurityId.issuanceVestingTerms!.vesting_conditions;
    const graphNodes = vestingConditions.map((vc) => {
      const graphNode: GraphNode = {
        ...vc,
        triggeredDate: undefined,
        prior_condition_ids: [],
      };

      return graphNode;
    });

    // Create vesting graph
    const { graph, rootNodes } = createVestingGraph(graphNodes);

    // Create the execution stack
    const executionStackBuilder = new this.executionStackBuilder(
      graph,
      rootNodes,
      OCFDataBySecurityId,
      this.executionPathStrategyFactory
    );
    const executionStack = executionStackBuilder.build();

    // Create installments from the execution stack
    const vestingInstallmentBuilder = new VestingInstallmentBuilder(
      OCFDataBySecurityId,
      executionStack
    );

    const vestingSchedule = vestingInstallmentBuilder.build();

    return vestingSchedule;
  }

  private declarativeStrategy(OCFDataBySecurityId: OCFDataBySecurityId) {
    return OCFDataBySecurityId.vestingObjects!.map((obj) => ({
      date: parseISO(obj.date),
      quantity: parseFloat(obj.amount),
    }));
  }

  private fullyVestedStrategy(OCFDataBySecurityId: OCFDataBySecurityId) {
    return [
      {
        date: parseISO(OCFDataBySecurityId.issuanceTransaction.date),
        quantity: parseFloat(OCFDataBySecurityId.issuanceTransaction.quantity),
      },
    ];
  }

  private applyRounding(vestingSchedule: VestingInstallment[]) {
    let cumulativeRemainder = 0;

    const roundedVestingSchedule = vestingSchedule.reduce(
      (acc, installment) => {
        const installmentRemainder =
          installment.quantity - Math.floor(installment.quantity);

        const newQuantity =
          installment.quantity + cumulativeRemainder + installmentRemainder;

        acc.push({
          ...installment,
          quantity: Math.floor(newQuantity),
        });

        cumulativeRemainder = newQuantity - Math.floor(newQuantity);

        return acc;
      },
      [] as VestingInstallment[]
    );

    return roundedVestingSchedule;
  }

  private processFirstVestingDate(
    vestingSchedule: VestingInstallment[],
    grantDate: Date
  ) {
    const firstIndexOnOrAfterGrantDate = vestingSchedule.findIndex(
      (installment) =>
        // this determines whether installment.date is after or equal to grantDate
        compareAsc(installment.date, grantDate) >= 0
    );

    let accumulatedQuantity = 0;

    const processedVestingSchedule = vestingSchedule.reduce(
      (acc, installment, index) => {
        accumulatedQuantity += installment.quantity;

        // accumulate and move on if the installment is before the firstVestingDateIndex
        if (index < firstIndexOnOrAfterGrantDate) {
          return acc;
        }

        if (index === firstIndexOnOrAfterGrantDate) {
          const modInstallment: VestingInstallment = {
            date: installment.date,
            quantity: accumulatedQuantity,
          };

          acc.push(modInstallment);
          return acc;
        }

        const modInstallment: VestingInstallment = {
          date: installment.date,
          quantity: installment.quantity,
        };

        acc.push(modInstallment);
        return acc;
      },
      [] as VestingInstallment[]
    );

    return processedVestingSchedule;
  }

  public generateSchedule(securityId: string): VestingInstallment[] {
    const OCFDataBySecurityId = this.getOCFData(securityId);
    const unroundedSchedule = this.getStrategy(OCFDataBySecurityId);

    const roundedSchedule = this.applyRounding(unroundedSchedule);

    const grantDate = parseISO(OCFDataBySecurityId.issuanceTransaction.date);
    const processedSchedule = this.processFirstVestingDate(
      roundedSchedule,
      grantDate
    );

    return processedSchedule;
  }

  public getStatus(vestingSchedule: VestingInstallment[], securityId: string) {
    const ocfData = this.getOCFData(securityId);

    const EARLY_EXERCISABLE = !!ocfData.issuanceTransaction.early_exercisable;
    const totalQuantity = parseFloat(ocfData.issuanceTransaction.quantity);

    // sort by vesting date
    vestingSchedule.sort((a, b) => compareAsc(a.date, b.date));

    let totalVested = 0;
    let totalUnvested = totalQuantity;

    const vestingScheduleWithStatus = vestingSchedule.map((installment) => {
      totalVested += installment.quantity;
      totalUnvested -= installment.quantity;

      const status: VestingScheduleStatus = {
        ...installment,
        becameVested: installment.quantity,
        totalVested,
        totalUnvested,
        becameExercisable: EARLY_EXERCISABLE ? 0 : installment.quantity,
      };

      return status;
    });

    // Add an installment for the grant date if the option is EARLY_EXERCISABLE and not fully vested on the grant date

    if (
      (ocfData.issuanceVestingTerms || ocfData.vestingObjects) &&
      EARLY_EXERCISABLE
    ) {
      vestingScheduleWithStatus.unshift({
        date: parseISO(ocfData.issuanceTransaction.date),
        quantity: 0,
        becameVested: 0,
        totalVested: 0,
        totalUnvested: totalQuantity,
        becameExercisable: EARLY_EXERCISABLE ? totalQuantity : 0,
      });
    }

    return vestingScheduleWithStatus;
  }
}
