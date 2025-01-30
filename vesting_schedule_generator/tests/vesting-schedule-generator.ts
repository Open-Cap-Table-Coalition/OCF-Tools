import { isBefore, parse } from "date-fns";
import { VestingScheduleGenerator } from "vesting_schedule_generator";
import { ExecutionPathBuilder } from "../execution-path/ExecutionPathBuilder";
import { ocfPackage as all_or_nothing } from "./testOcfPackages/documentation_examples/all-or-nothing";
import { ocfPackage as all_or_nothing_with_expiration } from "./testOcfPackages/documentation_examples/all-or-nothing-with-expiration";
import { ocfPackage as fourYear_oneYear_cliff_schedule } from "./testOcfPackages/documentation_examples/4yr-1yr-cliff-schedule";
import { ocfPackage as sixYear_option_back_loaded } from "./testOcfPackages/documentation_examples/6-yr-option-back-loaded";
import { ocfPackage as custom_vesting_100pct_upfront } from "./testOcfPackages/documentation_examples/custom-vesting-100pct-upfront";
import { ocfPackage as multi_tranche_event_based } from "./testOcfPackages/documentation_examples/multi-tranche-event-based";
import { ocfPackage as path_dependent_milestone_vesting } from "./testOcfPackages/documentation_examples/path-dependent-milestone-vesting";
import type {
  TX_Vesting_Event,
  TX_Vesting_Start,
  VestingInstallment,
} from "types";
import { OcfPackageContent } from "../../read_ocf_package";
import { ExecutionStrategyFactory } from "../execution-path/factory";

/******************************
 * helper functions
 ******************************/
const getTotalSharesUnderlying = (ocfPackage: OcfPackageContent) => {
  return ocfPackage.transactions.reduce((acc, tx) => {
    if (tx.object_type === "TX_EQUITY_COMPENSATION_ISSUANCE") {
      return (acc += parseFloat(tx.quantity));
    }
    return acc;
  }, 0);
};

const getSchedule = (ocfPackage: OcfPackageContent) => {
  // return generateVestingSchedule(ocfPackage, "equity_compensation_issuance_01");
  const generator = new VestingScheduleGenerator(
    ocfPackage,
    ExecutionPathBuilder,
    ExecutionStrategyFactory
  );

  return generator.generateSchedule("equity_compensation_issuance_01");
};

const getTotalVested = (schedule: VestingInstallment[]) => {
  return schedule.reduce((acc, installment) => {
    return (acc += installment.quantity);
  }, 0);
};

/******************************
 * all or nothing
 ******************************/
describe("all or nothing", () => {
  const ocfPackage: OcfPackageContent = {
    ...all_or_nothing,
  };

  describe("Event does not occur", () => {
    const schedule = getSchedule(ocfPackage);

    test("The total shares underlying should equal 4800", () => {
      expect(getTotalSharesUnderlying(ocfPackage)).toEqual(4800);
    });

    test("No shares should vest", () => {
      expect(getTotalVested(schedule)).toEqual(0);
    });
  });
  describe("Event occurs", () => {
    const event: TX_Vesting_Event = {
      id: "qualifying-sale",
      object_type: "TX_VESTING_EVENT",
      date: "2026-01-01",
      security_id: "equity_compensation_issuance_01",
      vesting_condition_id: "qualifying-sale",
    };

    ocfPackage.transactions.push(event);
    const schedule = getSchedule(ocfPackage);
    const totalSharesUnderlying = getTotalSharesUnderlying(ocfPackage);
    const totalVested = getTotalVested(schedule);

    test("The total shares underlying should equal 4800", () => {
      expect(totalSharesUnderlying).toEqual(4800);
    });

    test("Final total vested should equal the total shares underyling", () => {
      expect(totalVested).toEqual(totalSharesUnderlying);
    });

    test("Should not have a vesting event before 2026-01-01", () => {
      const vestingEventBeforeCliff = schedule.find(
        (installment) =>
          isBefore(
            installment.date,
            parse("2026-01-01", "yyyy-MM-dd", new Date())
          ) && installment.quantity > 0
      );
      expect(vestingEventBeforeCliff).toBeUndefined();
    });
  });
});

/******************************
 * all or nothing with expiration
 ******************************/
describe("all or nothing with expiration", () => {
  const ocfPackage = {
    ...all_or_nothing_with_expiration,
  };

  describe("qualifying sale does not occur", () => {
    const schedule = getSchedule(ocfPackage);
    const totalSharesUnderlying = getTotalSharesUnderlying(ocfPackage);
    const totalVested = getTotalVested(schedule);

    test("The total shares underlying should equal 4800", () => {
      expect(totalSharesUnderlying).toEqual(4800);
    });

    test("No shares should vest", () => {
      expect(totalVested).toEqual(0);
    });
  });

  describe("qualifying sale occurs", () => {
    const start_event: TX_Vesting_Start = {
      id: "vesting-start",
      object_type: "TX_VESTING_START",
      date: "2022-01-01",
      security_id: "equity_compensation_issuance_01",
      vesting_condition_id: "vesting-start",
    };

    const event: TX_Vesting_Event = {
      id: "qualifying-sale",
      object_type: "TX_VESTING_EVENT",
      date: "2024-01-01",
      security_id: "equity_compensation_issuance_01",
      vesting_condition_id: "qualifying-sale",
    };

    ocfPackage.transactions.push(start_event);
    ocfPackage.transactions.push(event);
    const schedule = getSchedule(ocfPackage);
    const totalSharesUnderlying = getTotalSharesUnderlying(ocfPackage);
    const totalVested = getTotalVested(schedule);

    test("The total shares underlying should equal 4800", () => {
      expect(totalSharesUnderlying).toEqual(4800);
    });

    test("Final total vested should equal the total shares underyling", () => {
      expect(totalVested).toEqual(totalSharesUnderlying);
    });

    test("Should not have a vesting event before 2024-01-01", () => {
      const vestingEventBeforeCliff = schedule.find(
        (installment) =>
          isBefore(
            installment.date,
            parse("2024-01-01", "yyyy-MM-dd", new Date())
          ) && installment.quantity > 0
      );
      expect(vestingEventBeforeCliff).toBeUndefined();
    });
  });
});

/******************************
 * Four year one year cliff schedule
 ******************************/

describe("Four year one year cliff schedule", () => {
  const ocfPackage = {
    ...fourYear_oneYear_cliff_schedule,
  };

  const start_event: TX_Vesting_Start = {
    id: "vesting-start",
    object_type: "TX_VESTING_START",
    date: "2025-01-01",
    security_id: "equity_compensation_issuance_01",
    vesting_condition_id: "vesting-start",
  };

  ocfPackage.transactions.push(start_event);
  const schedule = getSchedule(ocfPackage);
  const totalSharesUnderlying = getTotalSharesUnderlying(ocfPackage);
  const totalVested = getTotalVested(schedule);

  test("The total shares underlying should equal 4800", () => {
    expect(totalSharesUnderlying).toEqual(4800);
  });

  test("Final total vested should equal the total shares underyling", () => {
    expect(totalVested).toEqual(totalSharesUnderlying);
  });

  test("Should not have a vesting event before 2026-01-01", () => {
    const vestingEventBeforeCliff = schedule.find(
      (installment) =>
        isBefore(
          installment.date,
          parse("2026-01-01", "yyyy-MM-dd", new Date())
        ) && installment.quantity > 0
    );
    expect(vestingEventBeforeCliff).toBeUndefined();
  });
});

/******************************
 * Six Year Option Back Loaded
 ******************************/

describe("Six Year Option Back Loaded", () => {
  const ocfPackage = {
    ...sixYear_option_back_loaded,
  };

  const start_event: TX_Vesting_Start = {
    id: "vesting-start",
    object_type: "TX_VESTING_START",
    date: "2025-01-01",
    security_id: "equity_compensation_issuance_01",
    vesting_condition_id: "vesting-start",
  };

  ocfPackage.transactions.push(start_event);

  const schedule = getSchedule(ocfPackage);
  const totalSharesUnderlying = getTotalSharesUnderlying(ocfPackage);
  const totalVested = getTotalVested(schedule);

  test("The total shares underlying should equal 4800", () => {
    expect(totalSharesUnderlying).toEqual(4800);
  });

  test("Final total vested should equal the total shares underyling", () => {
    expect(totalVested).toEqual(totalSharesUnderlying);
  });

  test("Should not have a vesting event before 2027-01-01", () => {
    const vestingEventBeforeCliff = schedule.find(
      (installment) =>
        isBefore(
          installment.date,
          parse("2027-01-01", "yyyy-MM-dd", new Date())
        ) && installment.quantity > 0
    );
    expect(vestingEventBeforeCliff).toBeUndefined();
  });
});

/******************************
 * Custom Vesting 100% Upfront
 ******************************/

describe("Custom Vesting 100% Upfront", () => {
  const ocfPackage = { ...custom_vesting_100pct_upfront };

  const event: TX_Vesting_Event = {
    id: "full-vesting",
    object_type: "TX_VESTING_EVENT",
    date: "2024-01-01",
    security_id: "equity_compensation_issuance_01",
    vesting_condition_id: "full-vesting",
  };

  ocfPackage.transactions.push(event);

  const schedule = getSchedule(ocfPackage);
  const totalSharesUnderlying = getTotalSharesUnderlying(ocfPackage);
  const totalVested = getTotalVested(schedule);

  test("The total shares underlying should equal 4800", () => {
    expect(totalSharesUnderlying).toEqual(4800);
  });

  test("Final total vested should equal the total shares underyling", () => {
    expect(totalVested).toEqual(totalSharesUnderlying);
  });

  test("Should not have a vesting event before 2024-01-01", () => {
    const vestingEventBeforeCliff = schedule.find(
      (installment) =>
        isBefore(
          installment.date,
          parse("2024-01-01", "yyyy-MM-dd", new Date())
        ) && installment.quantity > 0
    );
    expect(vestingEventBeforeCliff).toBeUndefined();
  });
});

/******************************
 * Multi-Tranche Event-Based
 ******************************/

describe("Multi-Tranche Event-Based", () => {
  const ocfPackage = multi_tranche_event_based;

  // const fullSchedule = generateVestingSchedule(
  //   ocfPackage,
  //   "equity_compensation_issuance_01"
  // );

  const totalSharesUnderlying = ocfPackage.transactions.reduce((acc, tx) => {
    if (tx.object_type === "TX_EQUITY_COMPENSATION_ISSUANCE") {
      return (acc += parseFloat(tx.quantity));
    }
    return acc;
  }, 0);

  test("The total shares underlying should equal 4800", () => {
    expect(totalSharesUnderlying).toEqual(4800);
  });
});

/*********************************************
 * Path Dependent Milestone Vesting
 *********************************************/

describe("Path Dependent Milestone Vesting", () => {
  const ocfPackage = multi_tranche_event_based;

  // const fullSchedule = generateVestingSchedule(
  //   ocfPackage,
  //   "equity_compensation_issuance_01"
  // );

  const totalSharesUnderlying = ocfPackage.transactions.reduce((acc, tx) => {
    if (tx.object_type === "TX_EQUITY_COMPENSATION_ISSUANCE") {
      return (acc += parseFloat(tx.quantity));
    }
    return acc;
  }, 0);

  test("The total shares underlying should equal 4800", () => {
    expect(totalSharesUnderlying).toEqual(4800);
  });
});
