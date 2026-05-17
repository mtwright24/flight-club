/**
 * Injected before FLICA scripts run — intercept window.open / FLICA popup()
 * with in-place navigation and fake window objects (see flicaTbActivityPopupShim).
 */
export { INJECT_FLICA_RECORDER_POPUP_SHIM as INJECT_FLICA_POPUP_INTERCEPT } from "./flicaTbActivityPopupShim";
