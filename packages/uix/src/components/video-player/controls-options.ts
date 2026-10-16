/**
 * Ce que le lecteur expose de réglable, et rien d'autre : `<VideoCn>` s'installe
 * et fonctionne. Masquer un contrôle, changer une liste de valeurs, tout passe
 * par ici — jamais par une modification du code livré.
 *
 * La forme tient sur la durée grâce à une seule règle : **chaque contrôle vaut
 * `boolean | objet d'options`**. Absent ou `true`, il est là avec ses défauts ;
 * `false`, il disparaît ; un objet, il est là et réglé.
 *
 * La frontière avec les props de `<VideoCn>` : ici on règle **ce qui s'affiche**,
 * là-bas on fournit **ce qu'il y a à afficher**. Les chapitres tombent des deux
 * côtés — une prop racine `chapters` porte la liste, deux clés d'ici décident du
 * menu et du découpage de la barre.
 */

export interface ControlsOptions {
  /**
   * `auto` — la barre apparaît à l'activité et s'efface pendant la lecture.
   * `always` — jamais masquée. `never` — pas de barre du tout.
   */
  visibility?: "auto" | "always" | "never";
  /** Inactivité avant masquage, en millisecondes. */
  autoHideDelay?: number;
  play?: boolean;
  /**
   * La barre de progression. `{ chapters: false }` la garde d'un seul tenant
   * sans rien retirer au menu : découper la barre est un choix d'apparence, pas
   * de contenu.
   */
  scrubber?: boolean | { chapters?: boolean };
  /** L'horodatage `0:42 / 9:56`. */
  time?: boolean;
  volume?: boolean;
  fullscreen?: boolean;
  pictureInPicture?: boolean;
  /**
   * Le menu des chapitres. Contrairement au sélecteur de qualité, il
   * **disparaît** quand la vidéo n'a pas de chapitres au lieu de rester grisé :
   * la qualité existe pour toute vidéo, les chapitres sont une donnée que la
   * plupart n'auront jamais, et un bouton mort sur chaque lecteur serait du
   * bruit.
   */
  chapters?: boolean;
  playbackRate?: boolean | { rates?: readonly number[] };
  /** Le sélecteur de qualité. Grisé, et non masqué, quand le moteur n'expose rien. */
  quality?: boolean;
  /** La pastille « Direct », qui ne s'affiche que sur un flux en direct. */
  live?: boolean;
  /**
   * Les raccourcis clavier — `Espace`, `k`, les flèches, `m`, `f`, `0`–`9` —,
   * actifs quand le focus est dans le lecteur. `false` pour un hôte qui a déjà
   * les siens.
   */
  keyboard?: boolean;
}

/**
 * Tous les contrôles sont des objets, y compris ceux qui n'ont aujourd'hui rien
 * à régler : le jour où l'un d'eux gagne une option, ce que son lecteur attend
 * ne change pas.
 */
export interface ResolvedControlsOptions {
  visibility: "auto" | "always" | "never";
  autoHideDelay: number;
  play: { enabled: boolean };
  scrubber: { enabled: boolean; chapters: boolean };
  time: { enabled: boolean };
  volume: { enabled: boolean };
  fullscreen: { enabled: boolean };
  pictureInPicture: { enabled: boolean };
  chapters: { enabled: boolean };
  playbackRate: { enabled: boolean; rates: readonly number[] };
  quality: { enabled: boolean };
  live: { enabled: boolean };
  keyboard: { enabled: boolean };
}

/** Les vitesses de YouTube : assez fines pour être utiles, assez peu pour tenir dans un menu. */
export const DEFAULT_PLAYBACK_RATES: readonly number[] = Object.freeze([
  0.5, 0.75, 1, 1.25, 1.5, 1.75, 2,
]);

/** Trois secondes : le temps de trouver un bouton sans que la barre s'incruste. */
export const DEFAULT_AUTO_HIDE_DELAY = 3000;

/**
 * Le pas d'une flèche, en secondes sur le scrubber et en fraction sur le
 * volume. Déclarés ici parce que deux couches s'en servent — le curseur
 * focalisé et la keymap du lecteur — et qu'elles doivent tomber d'accord :
 * `→` ne peut pas avancer de 5 s sur le curseur et de 10 s ailleurs.
 */
export const DEFAULT_SEEK_STEP = 5;
export const DEFAULT_VOLUME_STEP = 0.05;

/**
 * Ce qu'on tolère **au-delà du retard naturel du flux** avant de se dire en
 * retard sur le direct.
 *
 * Ce n'est pas un retard absolu, et c'est tout l'enjeu : le bord n'avance pas
 * régulièrement — la fin de `seekable` saute d'un segment à chaque
 * rafraîchissement de playlist —, et le retard de croisière dépend du flux, de
 * trois secondes en basse latence à une trentaine sur un HLS classique. Un
 * seuil absolu ferait donc clignoter la pastille sur les flux dont la latence
 * tombe juste dessus : mesuré sur un direct de démonstration, l'écart oscillait
 * entre 8,6 s et 10,7 s et un seuil à 10 s basculait onze fois en dix secondes.
 * Le retard naturel est donc **mesuré** par la tête de lecture, et c'est de lui
 * qu'on s'écarte — dix secondes, soit un segment de large, jamais moins que le
 * saut qui fait osciller l'écart.
 *
 * Ici pour la même raison que les pas ci-dessus : trois couches s'en servent —
 * la pastille, l'horodatage et le scrubber — et elles doivent tomber d'accord.
 */
export const LIVE_EDGE_TOLERANCE = 10;

function toggle(value: boolean | undefined): { enabled: boolean } {
  // Seul `false` masque : une clé absente doit donner un lecteur complet.
  return { enabled: value !== false };
}

function resolveRates(rates: readonly number[] | undefined): readonly number[] {
  if (!rates) return DEFAULT_PLAYBACK_RATES;
  // `playbackRate` n'accepte que des nombres finis strictement positifs ; une
  // valeur invalide ferait échouer l'écriture sur l'élément, silencieusement.
  const cleaned = Array.from(new Set(rates.filter((rate) => Number.isFinite(rate) && rate > 0)));
  if (cleaned.length === 0) return DEFAULT_PLAYBACK_RATES;
  return Object.freeze(cleaned.sort((a, b) => a - b));
}

export function resolveControlsOptions(options: ControlsOptions = {}): ResolvedControlsOptions {
  const { playbackRate, scrubber } = options;
  const rateOptions = typeof playbackRate === "object" ? playbackRate : undefined;
  const scrubberOptions = typeof scrubber === "object" ? scrubber : undefined;

  return {
    visibility: options.visibility ?? "auto",
    autoHideDelay: options.autoHideDelay ?? DEFAULT_AUTO_HIDE_DELAY,
    play: toggle(options.play),
    scrubber: {
      enabled: scrubber !== false,
      chapters: scrubberOptions?.chapters !== false,
    },
    time: toggle(options.time),
    volume: toggle(options.volume),
    fullscreen: toggle(options.fullscreen),
    pictureInPicture: toggle(options.pictureInPicture),
    chapters: toggle(options.chapters),
    playbackRate: {
      enabled: playbackRate !== false,
      rates: resolveRates(rateOptions?.rates),
    },
    quality: toggle(options.quality),
    live: toggle(options.live),
    keyboard: toggle(options.keyboard),
  };
}
