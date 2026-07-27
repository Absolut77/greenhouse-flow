/**
 * Utilitaires de dates — évite le décalage d'un jour (off-by-one) causé par
 * la conversion UTC ↔ local.
 *
 * Règles :
 * - Colonnes `date` (ex: excise_reels.received_at) : chaînes "YYYY-MM-DD".
 *   On ne les passe JAMAIS dans `new Date(...)` (interprété en UTC puis
 *   reconverti en local ⇒ jour précédent). On les formate littéralement.
 * - Colonnes `timestamptz` (ex: stamp_movements.moved_at) : on formate
 *   toujours dans le fuseau de l'usine (America/Toronto).
 */

export const APP_TIMEZONE = "America/Toronto";

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/** Formate une date pure "YYYY-MM-DD" sans aucune conversion de fuseau. */
export function formatDateOnly(v: string | null | undefined): string {
  if (!v) return "—";
  const m = DATE_ONLY_RE.exec(v);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : v;
}

/** Formate un timestamptz en date locale (America/Toronto), format YYYY-MM-DD. */
export function formatZonedDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Formate un timestamptz en date + heure locale (America/Toronto). */
export function formatZonedDateTime(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Valeur "YYYY-MM-DD" pour un <input type="date"> à partir d'un timestamptz. */
export function toDateInputValue(v: string | null | undefined): string {
  if (!v) return "";
  const m = DATE_ONLY_RE.exec(v);
  if (m && v.length <= 10) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return parts;
}

/** Date du jour (Toronto) au format "YYYY-MM-DD". */
export function todayInputValue(): string {
  return toDateInputValue(new Date().toISOString());
}

/**
 * Convertit un "YYYY-MM-DD" saisi en timestamptz stable.
 * On ancre à 12:00 UTC : quel que soit le fuseau d'affichage
 * (Toronto = UTC-4/-5), la date rendue reste le même jour.
 */
export function dateInputToTimestamp(v: string): string | null {
  const m = DATE_ONLY_RE.exec(v ?? "");
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T12:00:00.000Z`;
}
