import type { Allocation_Type } from "types";

export class VestingModeService {
  static determineVestingMode(allocation_type: Allocation_Type) {
    switch (allocation_type) {
      case "CUMULATIVE_ROUNDING":
        return this.CumulativeRounding;
      case "CUMULATIVE_ROUND_DOWN":
        return this.CumulativeRoundDown;
      case "FRONT_LOADED":
        return this.FrontLoaded;
      case "BACK_LOADED":
        return this.Backloaded;
      case "FRONT_LOADED_TO_SINGLE_TRANCHE":
        return this.FrontLoadedToSingleTrache;
      case "BACK_LOADED_TO_SINGLE_TRANCHE":
        return this.BackLoadedToSingleTrache;
      case "FRACTIONAL":
        return this.Fractional;
    }
  }

  static CumulativeRounding = (
    installmentIndex: number,
    totalInstallments: number,
    totalQuantity: number
  ) => {
    const installmentCount = installmentIndex + 1;
    const cumulativePercent = installmentCount / totalInstallments;

    if (installmentCount === 1) {
      return Math.round(cumulativePercent * totalQuantity);
    }

    const lastCumulativePercent = (installmentCount - 1) / totalInstallments;
    return (
      Math.round(cumulativePercent * totalQuantity) -
      Math.round(lastCumulativePercent * totalQuantity)
    );
  };

  static CumulativeRoundDown = (
    installmentIndex: number,
    totalInstallments: number,
    totalQuantity: number
  ) => {
    const installmentCount = installmentIndex + 1;
    const cumulativePercent = installmentCount / totalInstallments;

    if (installmentCount === 1) {
      return Math.floor(cumulativePercent * totalQuantity);
    }

    const lastCumulativePercent = (installmentCount - 1) / totalInstallments;
    return (
      Math.floor(cumulativePercent * totalQuantity) -
      Math.floor(lastCumulativePercent * totalQuantity)
    );
  };

  static FrontLoaded = (
    installmentIndex: number,
    totalInstallments: number,
    totalQuantity: number
  ) => {
    const remainder = totalQuantity % totalInstallments;
    if (installmentIndex < remainder) {
      return Math.ceil(totalQuantity / totalInstallments);
    }
    return Math.floor(totalQuantity / totalInstallments);
  };

  static Backloaded = (
    installmentIndex: number,
    totalInstallments: number,
    totalQuantity: number
  ) => {
    const baseQuantity = Math.floor(totalQuantity / totalInstallments);
    const remainder = totalQuantity % totalInstallments;

    // Distribute the remainder to the last installments
    if (installmentIndex >= totalInstallments - remainder) {
      return baseQuantity + 1;
    }
    return baseQuantity;
  };

  static FrontLoadedToSingleTrache = (
    installmentIndex: number,
    totalInstallments: number,
    totalQuantity: number
  ) => {
    const remainder = totalQuantity % totalInstallments;
    if (installmentIndex === 0) {
      return Math.floor(totalQuantity / totalInstallments) + remainder;
    }
    return Math.floor(totalQuantity / totalInstallments);
  };

  static BackLoadedToSingleTrache = (
    installmentIndex: number,
    totalInstallments: number,
    totalQuantity: number
  ) => {
    const remainder = totalQuantity % totalInstallments;
    if (installmentIndex === totalInstallments - 1) {
      return Math.floor(totalQuantity / totalInstallments) + remainder;
    }
    return Math.floor(totalQuantity / totalInstallments);
  };

  static Fractional = (
    installmentIndex: number,
    totalInstallments: number,
    totalQuantity: number
  ) => {
    return totalQuantity / totalInstallments;
  };
}
