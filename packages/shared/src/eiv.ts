/**
 * EIV bands, shared by the scorer's consumers so every surface labels a score
 * the same way. EIV runs 0-100; 0 means no edge over a coin flip.
 */
export const EIV_STRONG_EDGE = 60;
export const EIV_MODERATE_EDGE = 30;

export type EivLabel = "Strong Edge" | "Moderate Edge" | "Weak Edge" | "No Edge";

export function eivLabel(eiv: number): EivLabel {
  if (eiv >= EIV_STRONG_EDGE) return "Strong Edge";
  if (eiv >= EIV_MODERATE_EDGE) return "Moderate Edge";
  if (eiv > 0) return "Weak Edge";
  return "No Edge";
}
