/**
 * Les chapitres, de ce que l'intégrateur écrit à ce que le lecteur dessine.
 *
 * **Deux formes, et c'est délibéré.** Dehors, un début et un titre : c'est tout
 * ce qu'on peut demander à quelqu'un qui tape sa liste à la main, et la fin
 * d'un chapitre est de toute façon le début du suivant. Dedans, une plage
 * complète et ses deux fractions, calculées une fois pour toutes.
 *
 * Ce passage d'une forme à l'autre n'est pas une coquetterie : il isole le
 * rendu de la source. Le jour où les chapitres arriveront d'un fichier WebVTT
 * — qui, lui, porte des fins explicites —, il suffira de produire le même
 * `ResolvedChapter[]`. Ni la piste ni le menu n'en sauront rien.
 */

/** Ce que l'intégrateur écrit. */
export interface Chapter {
  /** Le début, en secondes depuis l'origine de la vidéo. */
  time: number;
  label: string;
}

/** Ce que le lecteur consomme. Fabriqué par `resolveChapters`, jamais à la main. */
export interface ResolvedChapter {
  /** En secondes. */
  start: number;
  /** En secondes. Le début du chapitre suivant, ou la durée pour le dernier. */
  end: number;
  label: string;
  /** `start` rapporté à la durée, 0→1 : ce que vaut `--chapter-start`. */
  fraction: number;
  /** La largeur rapportée à la durée, 0→1 : ce que vaut `--chapter-span`. */
  span: number;
}

/**
 * Une référence stable pour « pas de chapitres ».
 *
 * Elle compte : la liste descend par un contexte et sert de dépendance à des
 * mémos et à un effet. Un tableau vide fabriqué à chaque appel les
 * déclencherait tous, à chaque rendu, pour rien.
 */
export const NO_CHAPTERS: readonly ResolvedChapter[] = Object.freeze([]);

/**
 * Le plancher d'une largeur de chapitre.
 *
 * `--chapter-span` est un diviseur dans la feuille de style. À zéro, la
 * déclaration devient invalide et le segment disparaît — pas d'erreur, juste
 * un trou. Les débuts étant uniques et triés, une largeur nulle ne devrait
 * jamais survenir ; ce plancher est là pour que l'arithmétique flottante ne
 * puisse pas en fabriquer une.
 */
const MIN_SPAN = 1e-6;

/**
 * La liste normalisée, triée, bornée à la durée.
 *
 * L'intégrateur n'a rien à garantir : ni l'ordre, ni l'absence de doublons, ni
 * la validité des nombres. C'est ici qu'on absorbe tout ça, une fois, plutôt
 * que de s'en défendre dans chaque couche de rendu.
 *
 * Une durée inconnue ou infinie rend une liste vide, et le direct tombe dans ce
 * cas tout seul : sans durée, un chapitre n'a pas de fin, et une fenêtre qui
 * glisse ne se découpe pas. Aucune condition dédiée au direct n'est donc
 * nécessaire — ni ici, ni chez ceux qui lisent le résultat.
 */
export function resolveChapters(
  chapters: readonly Chapter[] | undefined,
  duration: number,
): readonly ResolvedChapter[] {
  if (!chapters || chapters.length === 0) return NO_CHAPTERS;
  if (!Number.isFinite(duration) || duration <= 0) return NO_CHAPTERS;

  // Une `Map` plutôt qu'un tri suivi d'un dédoublonnage : deux chapitres au
  // même instant ne peuvent pas coexister — ils donneraient un segment de
  // largeur nulle —, et c'est le premier écrit qui gagne, comme partout
  // ailleurs quand une clé est répétée.
  const starts = new Map<number, string>();
  for (const chapter of chapters) {
    const time = chapter?.time;
    const label = typeof chapter?.label === "string" ? chapter.label.trim() : "";
    // Un chapitre qui commence à la durée, ou après, ne serait jamais atteint.
    if (!Number.isFinite(time) || time < 0 || time >= duration) continue;
    if (label.length === 0) continue;
    if (!starts.has(time)) starts.set(time, label);
  }
  if (starts.size === 0) return NO_CHAPTERS;

  const sorted = Array.from(starts.entries()).sort((a, b) => a[0] - b[0]);

  // Le premier chapitre commence à zéro, quoi qu'on nous ait donné. Un premier
  // chapitre à 0:30 laisserait la barre nue sur son premier vingtième : un
  // trou que personne ne saurait interpréter, et qui ferait croire à un bug
  // plutôt qu'à un choix.
  sorted[0][0] = 0;

  const resolved = sorted.map(([start, label], index) => {
    const end = index + 1 < sorted.length ? sorted[index + 1][0] : duration;
    return Object.freeze({
      start,
      end,
      label,
      fraction: start / duration,
      span: Math.max((end - start) / duration, MIN_SPAN),
    });
  });

  return Object.freeze(resolved);
}

/**
 * L'index du chapitre qui contient cet instant, ou `-1`.
 *
 * Parcours à rebours : le premier chapitre commençant à zéro, le premier
 * `start` franchi en descendant est forcément le bon. Une boucle et non une
 * dichotomie — une liste de chapitres se compte en dizaines, et le coût d'un
 * appel est ici sans commune mesure avec celui du rendu qu'il évite.
 */
export function findChapterIndex(chapters: readonly ResolvedChapter[], time: number): number {
  if (chapters.length === 0 || !Number.isFinite(time)) return -1;
  for (let index = chapters.length - 1; index >= 0; index -= 1) {
    if (time >= chapters[index].start) return index;
  }
  return -1;
}
