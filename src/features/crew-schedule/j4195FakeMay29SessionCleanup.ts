import { purgePairingDetailMonthCacheJ4195FakeMay292026 } from "./pairingDetailMonthCache";
import { purgeJ4195FakeMay292026CommittedAndWarm } from "./scheduleStableSnapshots";
import { purgeScheduleMonthUISnapshotsJ4195FakeMay292026 } from "./scheduleSnapshotCache";
import { purgeDetailNavStashJ4195FakeMay292026 } from "./tripDetailNavCache";

export function runJ4195FakeMay292026SessionCleanup(): void {
  purgeJ4195FakeMay292026CommittedAndWarm();
  purgePairingDetailMonthCacheJ4195FakeMay292026();
  purgeScheduleMonthUISnapshotsJ4195FakeMay292026();
  purgeDetailNavStashJ4195FakeMay292026();
}
