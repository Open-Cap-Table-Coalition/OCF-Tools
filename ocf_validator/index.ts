import { createActor } from "xstate";
import { OcfPackageContent, readOcfPackage } from "../read_ocf_package";
import constants from "./constants/constants";
import { ocfMachine, type OcfMachineContext, type OcfMachineEvent } from "./ocfMachine";

export const ocfValidator = (packagePath: string): OcfMachineContext => {
  const ocfPackage: OcfPackageContent = readOcfPackage(packagePath);
  const { manifest, transactions } = ocfPackage;

  // `constants.transaction_types` is a sort-only keyspace, intentionally narrower
  // than the machine's TX_TABLE — it doesn't list every transaction type, and
  // reconciling the two is out of scope here. Unknown object_types sort to the
  // front via indexOf === -1.
  const transactionTypes = constants.transaction_types;

  const sortedTransactions = transactions.sort((a: { date: string; object_type: string }, b: { date: string; object_type: string }) => a.date.localeCompare(b.date) || transactionTypes.indexOf(a.object_type) - transactionTypes.indexOf(b.object_type));

  // `ocfMachine` is already a configured machine (built with setup()), so it is
  // passed straight to createActor — no createMachine() wrapping.
  const ocfXstateActor = createActor(ocfMachine).start();

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
      // Boundary cast: `ele.object_type` and `ele` are read from disk, so TS
      // cannot correlate the runtime `type` with its matching payload in the
      // per-key event union. This single declared cast bridges parsed input to
      // the typed event; the machine's `'*'` handler rejects any unknown type.
      ocfXstateActor.send({ type: ele.object_type, data: ele } as OcfMachineEvent);
    }
  }

  if (ocfXstateActor.getSnapshot().value !== "validationError") {
    ocfXstateActor.send({ type: "RUN_EOD", date: currentDate });
    ocfXstateActor.send({ type: "RUN_END", date: currentDate });
  }

  // The machine is typed via setup(), so getSnapshot().context is OcfMachineContext
  // with no cast needed.
  return ocfXstateActor.getSnapshot().context;
};
