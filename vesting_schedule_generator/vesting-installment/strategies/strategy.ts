import Fraction from "fraction.js";
import type { GraphNode, VestingInstallment, OCFDataBySecurityId } from "types";

export interface CreateInstallmentConfig<T extends GraphNode> {
  node: T;
  vestedCount: number;
  ocfData: OCFDataBySecurityId;
  executionPath: Map<string, GraphNode>;
  beforeCliff?: boolean;
}

export abstract class CreateInstallmentStrategy<T extends GraphNode> {
  protected config: CreateInstallmentConfig<T>;
  public installments!: VestingInstallment[];

  constructor(config: CreateInstallmentConfig<T>) {
    this.config = config;
  }

  protected getSharesVesting(): Fraction {
    const totalShares = parseFloat(
      this.config.ocfData.issuanceTransaction.quantity
    );

    if (this.config.node.quantity) {
      return new Fraction(parseFloat(this.config.node.quantity));
    }

    if (this.config.node.portion) {
      const numerator = parseFloat(this.config.node.portion.numerator);
      const denominator = parseFloat(this.config.node.portion.denominator);

      if (denominator === 0) {
        /*
        TODO
        Consider throwing an error or warning here
        throw new Error(`The denominator provided in the \`portion\` of vesting condition with id ${this.config.node.id} is 0`)
        */
        return new Fraction(0);
      }

      // const portion = numerator / denominator;
      const portion = new Fraction(numerator, denominator);

      if (this.config.node.portion.remainder) {
        const remainingUnvestedShares = totalShares - this.config.vestedCount;
        // return portion * remainingUnvestedShares;
        return portion.mul(new Fraction(remainingUnvestedShares));
      }

      return portion.mul(new Fraction(totalShares));
    }

    return new Fraction(totalShares);
  }

  protected createInstallment(config: {
    date: Date;
    quantity: number;
  }): VestingInstallment {
    return {
      date: config.date,
      quantity: config.quantity,
    };
  }

  abstract getInstallments(): VestingInstallment[];
}
