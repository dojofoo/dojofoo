/**
 * Deux écritures d'un même temps : celle qu'on lit à l'écran, `9:56`, et celle
 * qu'un lecteur d'écran prononce, « 9 minutes 56 seconds ». La seconde n'est
 * pas une politesse : lu tel quel, `9:56` devient « neuf deux-points
 * cinquante-six », ou une heure de la journée.
 */

const SECONDS_PER_HOUR = 3600;

function split(seconds: number): { hours: number; minutes: number; secs: number } {
  const total = Math.floor(seconds);
  return {
    hours: Math.floor(total / SECONDS_PER_HOUR),
    minutes: Math.floor((total % SECONDS_PER_HOUR) / 60),
    secs: total % 60,
  };
}

/** `NaN`, négatif ou infini : rien de sensé à afficher, on repart de zéro. */
function sanitize(seconds: number): number {
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

/**
 * `m:ss`, ou `h:mm:ss` dès que `reference` atteint une heure.
 *
 * La forme est dictée par la **durée** et non par la valeur, pour que les deux
 * côtés de `0:42 / 1:02:13` aient la même écriture — `0:00:42` — et que le
 * libellé garde sa largeur quand la lecture franchit l'heure. Sans référence
 * finie (le direct), la valeur décide seule.
 */
export function formatTime(seconds: number, reference: number = seconds): string {
  const value = sanitize(seconds);
  const scale = Number.isFinite(reference) ? Math.max(sanitize(reference), value) : value;
  const { hours, minutes, secs } = split(value);
  const ss = String(secs).padStart(2, "0");

  if (scale >= SECONDS_PER_HOUR) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${ss}`;
  }
  // Sans heure, les minutes ne sont pas complétées : `0:42`, `9:56`, `59:59`.
  return `${hours * 60 + minutes}:${ss}`;
}

function unit(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

/**
 * La forme parlée, en anglais comme les autres libellés du lecteur. Les unités
 * nulles sont omises — « 1 hour 5 seconds » plutôt que « 1 hour 0 minutes
 * 5 seconds » — sauf si tout est nul.
 */
export function formatSpokenTime(seconds: number): string {
  const { hours, minutes, secs } = split(sanitize(seconds));
  const parts: string[] = [];
  if (hours > 0) parts.push(unit(hours, "hour"));
  if (minutes > 0) parts.push(unit(minutes, "minute"));
  if (secs > 0 || parts.length === 0) parts.push(unit(secs, "second"));
  return parts.join(" ");
}
