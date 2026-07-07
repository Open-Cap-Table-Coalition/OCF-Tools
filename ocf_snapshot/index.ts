import { ocfValidator } from "../ocf_validator";
import type { Snapshot } from "../types/snapshot";

export const ocfSnapshot = (packagePath: string, inputDateStr: string): Snapshot | null => {

    const snapshots = ocfValidator(packagePath).snapshots;
    const inputDate = new Date(inputDateStr);

    const filteredSnapshots = snapshots.filter((snapshot: Snapshot) => new Date(snapshot.date) <= inputDate);

    filteredSnapshots.sort((a: Snapshot, b: Snapshot) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const snapshot = filteredSnapshots.length? filteredSnapshots[0]: null;
    
    
    return snapshot;
}