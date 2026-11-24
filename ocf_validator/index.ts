import { createActor, getInitialSnapshot } from "xstate";
import { OcfPackageContent, readOcfPackage } from "../read_ocf_package";
import type { Finding } from "../types/finding";
import { emptyResult, errorResult, malformedResult, ocfMachine, type OcfMachineEvent } from "./ocfMachine";
import { type OcfMachineContext } from "../types/validator";
import { runOrder } from "./sameDayOrder";
import { isTxKey } from "./validators";

export const ocfValidator = (packagePath: string): OcfMachineContext => validateOcfPackage(readOcfPackage(packagePath));

/** Send back one list of findings for each transaction the validator finishes checking. */
export const validateOcfPackage = (
  ocfPackage: OcfPackageContent,
  onTransaction?: (findings: Finding[]) => void,
): OcfMachineContext => {
  const { manifest, transactions } = ocfPackage;

  // The run sorts transactions by date and looks each one up by its
  // object_type. A transaction where either isn't a string can't take its
  // place in the run, and can make the sort or the machine throw (#218), so
  // the run stops on it before it starts.
  const malformed = transactions.find((ele) => typeof ele?.date !== "string" || typeof ele?.object_type !== "string");
  if (malformed !== undefined) {
    return {
      ...getInitialSnapshot(ocfMachine).context,
      ocfPackageContent: ocfPackage,
      result: malformedResult(ocfPackage, malformed),
    };
  }

  // Work out the whole run before it starts: days in date order, and each day's transactions in an
  // order that follows the securities they name. Put the package's own list in that order too.
  // Checks that scan a security's history then report it the same way however the file was arranged.
  const run = runOrder(transactions);
  run.forEach((placed, index) => {
    transactions[index] = placed.transaction;
  });

  // `ocfMachine` is already a configured machine (built with setup()), so it is
  // passed straight to createActor — no createMachine() wrapping.
  const ocfXstateActor = createActor(ocfMachine);
  // If nothing observes the actor's errors, xstate rethrows one on a timer,
  // after this function has returned, which ends the process (#213). `send`
  // reports it instead.
  ocfXstateActor.subscribe({ error: () => {} });
  ocfXstateActor.start();

  // Sends `event` unless the run has stopped on a throw (the actor's status is
  // "error"). A throw stops the actor before it can record anything, so `send`
  // records it, naming the event being handled.
  let thrown: string | undefined;
  const send = (event: OcfMachineEvent, onFindings?: (findings: Finding[]) => void) => {
    const before = ocfXstateActor.getSnapshot();
    if (before.status !== "active") return;
    ocfXstateActor.send(event);
    const snapshot = ocfXstateActor.getSnapshot();
    if (snapshot.status === "error") thrown = errorResult(ocfPackage, event, snapshot.error);
    else onFindings?.(snapshot.context.findings.slice(before.context.findings.length));
  };

  // Load the package before the first transaction. A package with no transactions is loaded too, so
  // the returned records hold its stock plans.
  send({ type: "START", data: ocfPackage });

  // Send each day's transactions in order. When the date changes, close the day that just ended so
  // the machine checks its stock plans and takes its snapshot.
  let currentDate: string | undefined;
  for (const { transaction: ele, loop } of run) {
    if (currentDate !== undefined && ele.date !== currentDate) send({ type: "RUN_EOD", date: currentDate });
    currentDate = ele.date;
    // The package chooses object_type. A type the table does not list is sent as UNRECOGNIZED, so
    // that no value in a package can pass for one of the run's own events.
    const type: string = ele.object_type;
    if (!isTxKey(type)) send({ type: "UNRECOGNIZED", data: ele }, onTransaction);
    // A transaction the run could not place is sent with the loop it is in.
    else if (loop) send({ type: "UNORDERED", data: ele, loop }, onTransaction);
    // Boundary cast: `ele` is read from disk, so TS cannot correlate the runtime `type` with its
    // matching payload in the per-key event union. This single declared cast bridges parsed input
    // to the typed event.
    else send({ type, data: ele } as OcfMachineEvent, onTransaction);
  }

  // A package with no transactions has no day to close, so it gets no snapshot.
  if (currentDate !== undefined) {
    send({ type: "RUN_EOD", date: currentDate });
    send({ type: "RUN_END", date: currentDate });
  }

  // The machine is typed via setup(), so getSnapshot().context is OcfMachineContext
  // with no cast needed.
  const { context } = ocfXstateActor.getSnapshot();
  if (thrown !== undefined) return { ...context, result: thrown };
  // With nothing to count, the result says that no transaction was checked.
  return currentDate === undefined ? { ...context, result: emptyResult(ocfPackage) } : context;
};
