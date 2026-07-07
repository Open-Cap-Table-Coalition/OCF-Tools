import { createMachine, createActor } from "xstate";
import { OcfPackageContent, readOcfPackage } from "../read_ocf_package";
import constants from "./constants/constants";
import { ocfMachine, type OcfMachineContext } from "./ocfMachine";

export const ocfValidator = (packagePath: string): OcfMachineContext => {
  const ocfPackage: OcfPackageContent = readOcfPackage(packagePath);
  const { manifest, transactions } = ocfPackage;

  const transactionTypes = constants.transaction_types;

  const sortedTransactions = transactions.sort((a: { date: string; object_type: string }, b: { date: string; object_type: string }) => a.date.localeCompare(b.date) || transactionTypes.indexOf(a.object_type) - transactionTypes.indexOf(b.object_type));

  const ocfXstateMachine = createMachine(ocfMachine);

  const ocfXstateActor = createActor(ocfXstateMachine).start();

  let currentDate: any = null;

  // For the sorted transactions, we run through the set of transactions for a given day and then at the end of the day (EOD), we run the EOD action before moving onto the next day in the record.
  for (let i = 0; i < sortedTransactions.length; i++) {
    const ele = sortedTransactions[i];
    if (ocfXstateActor.getSnapshot().value !== "validationError") {
      // First determine if the date has changed. If it has, then we run the EOD action and then move onto the next day.
      if (ele.date !== currentDate) {
        if (currentDate === null) {
          ocfXstateActor.send({ type: "START", data: ocfPackage, date: ele.date });
        } else {
          ocfXstateActor.send({ type: "RUN_EOD", date: currentDate });
        }
      }
      currentDate = ele.date;
      ocfXstateActor.send({ type: ele.object_type, data: ele });
    }
  }

  if (ocfXstateActor.getSnapshot().value !== "validationError") {
    ocfXstateActor.send({ type: "RUN_EOD", date: currentDate });
    ocfXstateActor.send({ type: "RUN_END", date: currentDate });
  }

  // xstate types getSnapshot().context as Record<string, any> (the machine config is
  // still annotated `any`), so cast to the real context shape at this boundary. #157
  // types the machine via setup() and MUST drop this cast — left in place, it would
  // suppress a genuine mismatch between the declared and actual context.
  return ocfXstateActor.getSnapshot().context as OcfMachineContext;
};
