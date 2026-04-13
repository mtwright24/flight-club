/**
 * JetBlue FLICA parser constants.
 * TACLAG, GRNT, DHC: obsolete for JetBlue operational logic — never branch import decisions on these labels.
 * OAEQP / OEQP: equipment — preserve.
 */

export {
  JETBLUE_FLICA_EQUIPMENT_FIELD_CODES,
  JETBLUE_FLICA_OBSOLETE_FIELD_CODES,
  JETBLUE_MINIMUM_CREDIT_HOURS_PER_DAY,
  JETBLUE_FLICA_MONTHLY_SOURCE_TYPE,
  isJetBlueEquipmentFieldCode,
  isObsoleteJetBlueFlicaFieldCode,
} from '../../crew-schedule/jetblueFlicaUnderstanding';

/** Pairing code: J + digits, optional C prefix (e.g. JC58). */
export const PAIRING_CODE_REGEX = /\b(JC?\d{3,5})\b/i;

/** FLICA-style date token: 03APR */
export const DATE_TOKEN_DDMMM_REGEX = /\b(\d{1,2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/i;

/** Duty day line: MO 06, FR 03 */
export const DUTY_DAY_MARKER_REGEX = /^(SU|MO|TU|WE|TH|FR|SA)\s+(\d{1,2})\b/i;

/** Local time with optional L suffix */
export const TIME_LOCAL_REGEX = /\b(\d{1,2}):(\d{2})\s*(AM|PM)?L?\b|\b(\d{3,4})L\b/i;
