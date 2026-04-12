/**
 * JetBlue IFC pairing credit — RIG components (contract-grounded formulas for tooling).
 * Final payable credit = max of applicable rig vs raw shown credit where required by agreement.
 * Values are hours unless noted.
 */

export type RigInputs = {
  /** Raw credit from FLICA / pairing footer (TCRD or equivalent). */
  rawShownCreditHours: number | null;
  /** TAFB hours for the pairing (elapsed away from base). */
  tafbHours: number | null;
  /** Sum of actual duty hours in the pairing (if known). */
  actualDutyHours: number | null;
  /** Average MDPC context — minimum duty period credit threshold (contract); use when MDPC average below floor. */
  averageMdpcHours: number | null;
};

const TAFB_RIG_DIVISOR = 3.5;
const TAFB_RIG_CREDIT_PER_BLOCK = 1;
const DUTY_RIG_DIVISOR = 2;
const DUTY_RIG_CREDIT_PER_BLOCK = 1;
const MDPC_AVG_FLOOR_HOURS = 5;

/**
 * TAFB rig: minimum 1 hour credit per 3.5 hours away from base (IFC CBA — verify article in uploaded CBA PDF).
 */
export function computeTafbRigCreditHours(tafbHours: number | null): number | null {
  if (tafbHours == null || tafbHours <= 0) return null;
  return (tafbHours / TAFB_RIG_DIVISOR) * TAFB_RIG_CREDIT_PER_BLOCK;
}

/**
 * Average MDPC rig: 5-hour average minimum duty period credit where applicable.
 */
export function computeAverageMdpcRigCreditHours(averageMdpcHours: number | null): number | null {
  if (averageMdpcHours == null) return null;
  if (averageMdpcHours >= MDPC_AVG_FLOOR_HOURS) return averageMdpcHours;
  return MDPC_AVG_FLOOR_HOURS;
}

/**
 * Duty rig: minimum 1 hour credit per 2 hours of actual duty.
 */
export function computeDutyRigCreditHours(actualDutyHours: number | null): number | null {
  if (actualDutyHours == null || actualDutyHours <= 0) return null;
  return (actualDutyHours / DUTY_RIG_DIVISOR) * DUTY_RIG_CREDIT_PER_BLOCK;
}

/**
 * Final pairing credit = max of raw shown and each computed rig leg (per product rules).
 */
export function computeFinalPairingCreditHours(input: RigInputs): {
  tafbRig: number | null;
  mdpcRig: number | null;
  dutyRig: number | null;
  finalCredit: number | null;
} {
  const tafbRig = computeTafbRigCreditHours(input.tafbHours);
  const mdpcRig = computeAverageMdpcRigCreditHours(input.averageMdpcHours);
  const dutyRig = computeDutyRigCreditHours(input.actualDutyHours);
  const candidates = [input.rawShownCreditHours, tafbRig, mdpcRig, dutyRig].filter(
    (x): x is number => x != null && !Number.isNaN(x)
  );
  const finalCredit = candidates.length === 0 ? null : Math.max(...candidates);
  return { tafbRig, mdpcRig, dutyRig, finalCredit };
}
