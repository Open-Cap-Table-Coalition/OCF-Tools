import { createActor, getInitialSnapshot } from "xstate";
import { OcfPackageContent, readOcfPackage } from "../read_ocf_package";
import constants from "./constants/constants";
import { errorResult, malformedResult, ocfMachine, type OcfMachineContext, type OcfMachineEvent } from "./ocfMachine";

export const ocfValidator = (packagePath: string): OcfMachineContext => {
  const ocfPackage: OcfPackageContent = readOcfPackage(packagePath);
  const { manifest, transactions } = ocfPackage;

  // The run sorts transactions by date and sends each to the machine as an
  // event of its object_type. A transaction where either isn't a string can't
  // take its place in the run, and can make the sort or the machine throw
  // (#218), so the run stops on it before it starts.
  const malformed = transactions.find((ele) => typeof ele?.date !== "string" || typeof ele?.object_type !== "string");
  if (malformed !== undefined) {
    return {
      ...getInitialSnapshot(ocfMachine).context,
      ocfPackageContent: ocfPackage,
      result: malformedResult(ocfPackage, malformed),
    };
  }

  // Same-day sort tiebreaker. `transaction_types` is pinned to cover every
  // transaction type (see types/transaction-types.assert.ts), so an added OCF
  // type forces an explicit sort position rather than silently sorting to the
  // front via `indexOf === -1`. Widened to `readonly string[]` so `indexOf`
  // accepts the parsed `object_type`, which is a plain string.
  const transactionTypes: readonly string[] = constants.transaction_types;

  const sortedTransactions = transactions.sort((a: { date: string; object_type: string }, b: { date: string; object_type: string }) => a.date.localeCompare(b.date) || transactionTypes.indexOf(a.object_type) - transactionTypes.indexOf(b.object_type));

  // `ocfMachine` is already a configured machine (built with setup()), so it is
  // passed straight to createActor — no createMachine() wrapping.
  const ocfXstateActor = createActor(ocfMachine);
  // If nothing observes the actor's errors, xstate rethrows one on a timer,
  // after this function has returned, which ends the process (#213). `send`
  // reports it instead.
  ocfXstateActor.subscribe({ error: () => {} });
  ocfXstateActor.start();

  // Sends `event` unless the run has stopped: on a transaction that failed
  // validation (the machine is done), or on a throw (its status is "error").
  // A throw stops the actor before it can record anything, so `send` records
  // it, naming the event being handled.
  let thrown: string | undefined;
  const send = (event: OcfMachineEvent) => {
    if (ocfXstateActor.getSnapshot().status !== "active") return;
    ocfXstateActor.send(event);
    const snapshot = ocfXstateActor.getSnapshot();
    if (snapshot.status === "error") thrown = errorResult(ocfPackage, event, snapshot.error);
  };

  let currentDate: any = null;

  // For the sorted transactions, we run through the set of transactions for a given day and then at the end of the day (EOD), we run the EOD action before moving onto the next day in the record.
  for (let i = 0; i < sortedTransactions.length; i++) {
    const ele = sortedTransactions[i];
    // First determine if the date has changed. If it has, then we run the EOD action and then move onto the next day.
    if (ele.date !== currentDate) {
      if (currentDate === null) {
        send({ type: "START", data: ocfPackage, date: ele.date });
      } else {
        send({ type: "RUN_EOD", date: currentDate });
      }
    }
    currentDate = ele.date;
    // Boundary cast: `ele.object_type` and `ele` are read from disk, so TS
    // cannot correlate the runtime `type` with its matching payload in the
    // per-key event union. This single declared cast bridges parsed input to
    // the typed event; the machine's `'*'` handler rejects any unknown type.
    send({ type: ele.object_type, data: ele } as OcfMachineEvent);
  }

  send({ type: "RUN_EOD", date: currentDate });
  send({ type: "RUN_END", date: currentDate });

  // The machine is typed via setup(), so getSnapshot().context is OcfMachineContext
  // with no cast needed.
  const { context } = ocfXstateActor.getSnapshot();
  return thrown === undefined ? context : { ...context, result: thrown };
};
