import { compareAsc, compareDesc, isBefore, isEqual, parseISO } from "date-fns";
import { OcfPackageContent } from "../read_ocf_package";
import type { VestingScheduleStatus, OCFDataBySecurityId } from "types";
import { VestingScheduleGenerator } from "../vesting_schedule_generator/index.ts";
import { getOCFDataBySecurityId } from "../vesting_schedule_generator/get-ocf-data-by-security-id.ts";
import { ExecutionStackBuilder } from "../vesting_schedule_generator/execution-stack/ExecutionStackBuilder.ts";
import { ExecutionStrategyFactory } from "../vesting_schedule_generator/execution-stack/factory.ts";

// Define the interface for the data supplied to the calculator
interface Installment extends VestingScheduleStatus {
  securityId: string;
  grantDate: string;
  Year: number; // Represents the year of the ISO/NSO test
  FMV: number; // for now we assume that the FMV is the exercise price if there is no valuation.id.  Better approaches to be discussed.
  Grant_Type: "NSO" | "ISO" | "INTL";
  CancelledDate?: Date;
}

// Define the interface for the results of the ISO/NSO test
export interface ISONSOTestResult
  extends Pick<
    Installment,
    | "Year"
    | "date"
    | "quantity"
    | "grantDate"
    | "securityId"
    | "becameExercisable"
    | "FMV"
  > {
  StartingCapacity: number;
  ISOShares: number;
  NSOShares: number;
  CapacityUtilized: number;
  CapacityRemaining: number;
}

export class ISOCalculator {
  constructor(private ocfPackage: OcfPackageContent) {}

  private securityIds(stakeholderId: string) {
    return this.ocfPackage.transactions
      .filter(
        (tx) =>
          tx.object_type === "TX_EQUITY_COMPENSATION_ISSUANCE" &&
          tx.stakeholder_id === stakeholderId
      )
      .map((issuance) => issuance.security_id);
  }

  public prepareVestingInstallments(stakeholderId: string): Installment[] {
    const securityIds = this.securityIds(stakeholderId);
    const result = securityIds.map((securityId) => {
      /***************************************
       * generate vesting the vesting schedule
       ***************************************/

      const generator = new VestingScheduleGenerator(
        this.ocfPackage,
        ExecutionStackBuilder,
        ExecutionStrategyFactory
      );

      const schedule = generator.generateSchedule(securityId);

      /*************************************************************************************
       * Get the relevant ocfData
       *
       *
       * We know that getOCFDataBySecurityId will not return any issues
       * because if it did they would have been returned when calling generateVestingSchedule
       **************************************************************************************/

      const ocfData = getOCFDataBySecurityId(this.ocfPackage, securityId);

      /*********************************************************
       * Add details regarding quantity that became exercisable
       *********************************************************/

      const vestingScheduleWithStatus = generator.getStatus(
        schedule,
        securityId
      );

      /**************************************************************
       * Add additional information required for the ISO calculation
       **************************************************************/

      const installments: Installment[] = vestingScheduleWithStatus.map(
        (status) => ({
          ...status,
          securityId,
          grantDate: ocfData.issuanceTransaction.date,
          Year: status.date.getFullYear(),
          FMV: this.getFMV(ocfData),
          Grant_Type: ocfData.issuanceTransaction.option_grant_type,
        })
      );

      return installments;
    });

    return result.flat();
  }

  public execute(stakeholderId: string): ISONSOTestResult[] {
    /**************************************************
     * Prepare vesting installments for ISO calculation
     **************************************************/

    const vestingInstallments = this.prepareVestingInstallments(stakeholderId);

    /*******************************************
     * Calculate ISO / NSO splits for each year
     *******************************************/
    const result = this.calculate(vestingInstallments);

    return result;
  }

  /**
   * Assumes that the FMV on the grant date is equal to the exercise price if there is no valuation_id
   * @param issuanceTX
   */
  private getFMV(ocfData: OCFDataBySecurityId): number {
    const issuanceTransaction = ocfData.issuanceTransaction;
    const valuations = ocfData.valuations;
    if (valuations.length === 0) {
      if (
        !issuanceTransaction.exercise_price ||
        !issuanceTransaction.exercise_price.amount
      ) {
        throw new Error(
          `Neither a valuation or exercise price is available for equity issuance with security id ${ocfData.issuanceTransaction.id}`
        );
      } else {
        return parseFloat(issuanceTransaction.exercise_price.amount);
      }
    }

    const grantDate = issuanceTransaction.date;
    valuations.sort((a, b) =>
      compareDesc(parseISO(a.effective_date), parseISO(b.effective_date))
    );
    const relevantValuation = valuations.find((valuation) =>
      isBefore(parseISO(valuation.effective_date), grantDate)
    );
    if (!relevantValuation) {
      throw new Error(
        `Neither a valuation or exercise price is available for equity issuance with security id ${ocfData.issuanceTransaction.id}`
      );
    }
    return parseFloat(relevantValuation.price_per_share.amount);
  }

  /**
   * Sorts installments - first by grant date, then by vesting date
   */
  private sortVestingInstallments(vestingInstallments: Installment[]) {
    return vestingInstallments.sort((a, b) => {
      if (isEqual(a.grantDate, b.grantDate)) {
        return compareAsc(a.date, b.date);
      }
      return compareAsc(a.grantDate, b.grantDate);
    });
  }

  private isIncludedInTest(
    installment: Installment,
    year: number,
    cancelledDate?: Date
  ) {
    return (
      installment.Grant_Type === "ISO" &&
      (cancelledDate === undefined || cancelledDate.getFullYear() >= year)
    );
  }

  private getCancelledDate(securityId: string) {
    const cancellationTransactions = this.ocfPackage.transactions.filter(
      (tx) =>
        tx.object_type === "TX_EQUITY_COMPENSATION_CANCELLATION" &&
        tx.security_id === securityId
    );

    // assumes each securityId would only have a single cancellation transaction

    if (cancellationTransactions.length === 0) return;
    const cancellationDate = cancellationTransactions.map((tx) =>
      parseISO(tx.date)
    );
    return cancellationDate[0];
  }

  private calculate(installments: Installment[]) {
    let currentYear = installments[0].Year;
    const ANNUAL_CAPACITY = 100000;
    let CapacityRemaining = ANNUAL_CAPACITY;

    const sortedInstallments = this.sortVestingInstallments(installments);

    const result = sortedInstallments.reduce((acc, current) => {
      const {
        Year,
        date,
        quantity,
        grantDate,
        securityId,
        becameExercisable,
        FMV,
      } = current;

      // If the year changes, reset the remaining capacity to 100,000 and reset the current Year,
      if (Year !== currentYear) {
        CapacityRemaining = ANNUAL_CAPACITY;
        currentYear = Year;
      }

      const StartingCapacity = CapacityRemaining;

      // Determine how many shares in included in this iteration of the test
      const ISOEligibleShares = this.isIncludedInTest(
        current,
        currentYear,
        this.getCancelledDate(current.securityId)
      )
        ? becameExercisable
        : 0;

      // Determine how many shares can be ISOs based on the remainingCapacity
      const MaxISOShares = Math.floor(CapacityRemaining / FMV);

      // Determine how many shares are ISOs
      const ISOShares = Math.min(MaxISOShares, ISOEligibleShares);

      // Determine how many shares are NSOs
      const NSOShares = becameExercisable - ISOShares;

      // Determine how much capacity was utilized
      const CapacityUtilized = ISOShares * FMV;

      // Update remaining capacity after usage
      CapacityRemaining -= CapacityUtilized;

      const interim: ISONSOTestResult = {
        Year,
        date,
        quantity,
        grantDate,
        securityId,
        becameExercisable,
        FMV,
        StartingCapacity,
        ISOShares,
        NSOShares,
        CapacityUtilized,
        CapacityRemaining,
      };

      acc.push(interim);
      return acc;
    }, [] as ISONSOTestResult[]);

    return result;
  }
}
