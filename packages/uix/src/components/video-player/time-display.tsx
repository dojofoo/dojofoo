import { memo } from "react";

import { useControlsOptions } from "./controls-context";
import { formatSpokenTime, formatTime } from "./format-time";
import { usePlayerValue, usePlayheadValue } from "./player-context";
import { displayedTime, type PlayheadSnapshot } from "./playhead-store";
import { selectIsLive, type PlayerState } from "./player-state-store";

/**
 * La seconde entière et non le temps exact : c'est tout ce que l'horodatage
 * affiche, et le sélecteur ne réveille le composant que lorsqu'elle change —
 * un rendu par seconde de média, pas soixante.
 *
 * `displayedTime` fait suivre le doigt pendant un glissement plutôt que la
 * vidéo, qui ne cherche qu'à intervalles : l'horodatage reste d'accord avec la
 * poignée du scrubber.
 */
function selectDisplayedSecond(snapshot: PlayheadSnapshot): number {
  return Math.floor(displayedTime(snapshot));
}

/**
 * Le retard sur le bord du direct, à la seconde. Arrondi et non tronqué : c'est
 * un écart et non une position, et 41,6 s de retard s'annoncent « 42 » ;
 * arrondi tout court, pour la même raison que la seconde ci-dessus — la tête de
 * lecture avance soixante fois par seconde et le bord glisse avec elle.
 *
 * Hors direct, la valeur n'est pas lue : elle change au même rythme que la
 * seconde affichée, donc elle ne provoque aucun rendu de plus.
 */
function selectLiveDelay(snapshot: PlayheadSnapshot): number {
  return Math.round(snapshot.seekableEnd - displayedTime(snapshot));
}

/**
 * Hors direct, le retard sur le bord n'a aucun sens — et s'y abonner coûterait
 * un rendu de plus par seconde : il change à contretemps de la seconde
 * affichée, si bien que l'horodatage se réveillait deux fois par seconde de
 * média au lieu d'une. Mesuré. Un sélecteur constant coupe l'abonnement.
 */
function selectNoDelay(): number {
  return 0;
}

/** Au bord, c'est la tête de lecture qui tranche : voir `atLiveEdge`. */
function selectAtLiveEdge(snapshot: PlayheadSnapshot): boolean {
  return snapshot.atLiveEdge;
}

function selectDuration(state: PlayerState): number {
  return state.duration;
}

/**
 * Le vrai signe moins (U+2212) et non le trait d'union : avec `tabular-nums`,
 * il a la chasse d'un chiffre et l'horodatage ne se déhanche pas quand le
 * retard apparaît. Il n'est jamais prononcé — le lecteur d'écran reçoit la
 * forme parlée, en toutes lettres.
 */
const MINUS_SIGN = "−";

/**
 * Au bord du direct, un tiret cadratin plutôt qu'un vide : la place reste
 * prise, et tomber en retard ne fait pas naître un bloc de texte au milieu de
 * la barre.
 */
const NO_DELAY = "—";

/**
 * Les deux écritures d'un même instant. `spoken` est vide quand il n'y a rien à
 * annoncer, au bord du direct : la pastille « Live » porte déjà l'information,
 * et la répéter ne ferait qu'allonger la lecture de la barre.
 */
interface TimeLabels {
  visual: string;
  spoken: string;
}

function vodLabels(current: number, duration: number): TimeLabels {
  // En direct, la durée vaut `Infinity` ; avant les métadonnées, zéro. Dans les
  // deux cas il n'y a pas de total à afficher, seulement le temps courant.
  const hasDuration = Number.isFinite(duration) && duration > 0;
  return {
    visual: hasDuration
      ? `${formatTime(current, duration)} / ${formatTime(duration, duration)}`
      : formatTime(current, duration),
    spoken: hasDuration
      ? `${formatSpokenTime(current)} of ${formatSpokenTime(duration)}`
      : formatSpokenTime(current),
  };
}

function liveLabels(delay: number, atEdge: boolean): TimeLabels {
  // La même décision que la pastille, prise au même endroit : deux calculs
  // séparés feraient dire « Live » à l'une pendant que l'autre affiche un
  // retard.
  if (atEdge) return { visual: NO_DELAY, spoken: "" };
  return {
    visual: `${MINUS_SIGN}${formatTime(delay)}`,
    spoken: `${formatSpokenTime(delay)} behind live`,
  };
}

/**
 * L'horodatage `0:42 / 9:56`, ou le retard sur le direct — `−0:42` — sur un
 * flux sans fin. Aucune prop, comme les autres contrôles.
 *
 * Pas de région live : une annonce par seconde rendrait le lecteur d'écran
 * inutilisable. Le texte se lit quand on vient le chercher, et c'est le
 * scrubber qui annonce la position quand on la change.
 */
export const TimeDisplay = memo(function TimeDisplay() {
  const { time } = useControlsOptions();
  const current = usePlayheadValue(selectDisplayedSecond);
  const duration = usePlayerValue(selectDuration);
  const isLive = usePlayerValue(selectIsLive);
  const liveDelay = usePlayheadValue(isLive ? selectLiveDelay : selectNoDelay);
  const atLiveEdge = usePlayheadValue(selectAtLiveEdge);

  if (!time.enabled) return null;

  const { visual, spoken } = isLive
    ? liveLabels(liveDelay, atLiveEdge)
    : vodLabels(current, duration);

  return (
    <span
      data-slot="video-player-time"
      // Des chiffres, comme le scrubber qu'il accompagne : ils se lisent de
      // gauche à droite dans toutes les langues. Sans ça, l'algorithme bidi
      // d'un projet RTL affiche `9:56 / 0:00`.
      dir="ltr"
      // `tabular-nums` : sans chiffres à chasse fixe, le texte change de
      // largeur à chaque seconde et vibre sous les yeux.
      //
      // Dans une barre de moins de 30rem de contenu (lecteur < ≈ 506 px), le
      // curseur de volume déplié n'aurait que quelques pixels de piste : tant
      // qu'il est déplié, l'horodatage passe en `sr-only` — masqué à l'écran,
      // toujours lu. Le seuil laisse ≈ 54 px de marge à une vidéo de moins
      // d'une heure avec chapitres (≈ 426 px nécessaires, `59:59 / 59:59`).
      // Les trois conditions recopient celles du volet de `volume-control.tsx`,
      // dont ce `span` doit rester le voisin immédiat (`peer/volume`) ; le
      // focus est restreint à `hover: hover` comme le volet, qu'un appareil sans
      // survol n'affiche jamais.
      className="mx-2 text-sm whitespace-nowrap tabular-nums @max-[30rem]:peer-hover/volume:sr-only @max-[30rem]:peer-has-data-dragging/volume:sr-only @max-[30rem]:[@media(hover:hover)]:peer-has-focus-visible/volume:sr-only"
    >
      {/* Deux écritures, une pour chaque canal. Lu tel quel, `9:56` devient
          « neuf deux-points cinquante-six », ou une heure de la journée : les
          yeux reçoivent la forme compacte, le lecteur d'écran la forme parlée.
          Aucune des deux n'est une région live, le texte se lit quand on vient
          le chercher. */}
      <span aria-hidden="true">{visual}</span>
      {spoken ? <span className="sr-only">{spoken}</span> : null}
    </span>
  );
});
