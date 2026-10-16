import type shaka from "shaka-player";

import { createNativeEngine } from "./native-engine";
import { NO_CAPABILITIES } from "./player-engine";
import type { EngineCapabilities, PlayerEngine, QualityLevel, SourceType } from "./player-engine";

/**
 * Le moteur des sources adaptatives — HLS et DASH. Shaka n'est jamais importé
 * au chargement de ce module : il l'est à l'intérieur de `load()`, et c'est
 * toute la raison d'être de ce découpage. Un projet qui ne sert que des MP4
 * progressifs ne verra pas passer une seule ligne de Shaka dans son bundle.
 */

/** L'espace de noms Shaka tel qu'il arrive de l'import dynamique. */
type ShakaNamespace = (typeof import("shaka-player"))["default"];

/**
 * Mémorisé au niveau du module, pas de la fabrique : deux lecteurs sur la même
 * page partagent un seul téléchargement et une seule installation des
 * polyfills, qui sont globaux par nature.
 */
let shakaModule: Promise<ShakaNamespace> | null = null;

function importShaka(): Promise<ShakaNamespace> {
  shakaModule ??= import("shaka-player").then((mod) => {
    // Le paquet est compilé façon Closure : selon le bundler et le format de
    // sortie, l'espace de noms arrive en export par défaut ou directement comme
    // objet du module. On accepte les deux plutôt que de parier sur l'interop.
    const namespace: ShakaNamespace = mod.default ?? (mod as unknown as ShakaNamespace);
    // Les polyfills alignent EME, `MediaSource` et `VTTCue` d'un navigateur à
    // l'autre. Ils s'installent globalement, une fois pour la page.
    namespace.polyfill.installAll();
    return namespace;
  });
  return shakaModule;
}

/**
 * Au-delà, une même hauteur mérite sa propre entrée : « 1080p » et « 1080p60 »
 * ne se valent pas à l'œil, et personne ne veut choisir entre deux lignes
 * identiques.
 */
const HIGH_FRAME_RATE = 30;

/**
 * Ce qu'on garde devant la tête de lecture en changeant de qualité.
 *
 * Tout vider fait apparaître la nouvelle qualité dans la seconde sur un
 * navigateur de bureau — deux cents millisecondes mesurées —, mais laisse la
 * balise sans une seule image à jouer le temps que le premier segment arrive.
 * Sur iPhone, où `ManagedMediaSource` gouverne le tampon, elle reste alors
 * figée sur la dernière image et ne repart pas. La documentation de Shaka le
 * dit sans détour : en dessous de deux segments, le changement « provoque des
 * hoquets sur certains navigateurs ».
 *
 * On garde donc un segment, mesuré sur le flux lui-même plutôt que supposé, et
 * borné : deux secondes au moins pour qu'il reste quelque chose à jouer,
 * quatre au plus pour que le changement se voie encore comme une réponse au
 * clic. Un flux à segments de dix secondes ne fera donc pas attendre dix
 * secondes.
 */
const MIN_SWITCH_MARGIN = 2;
const MAX_SWITCH_MARGIN = 4;

function switchSafeMargin(player: shaka.Player): number {
  const { maxSegmentDuration } = player.getStats();
  const segment =
    Number.isFinite(maxSegmentDuration) && maxSegmentDuration > 0
      ? maxSegmentDuration
      : MIN_SWITCH_MARGIN;
  return Math.min(Math.max(segment, MIN_SWITCH_MARGIN), MAX_SWITCH_MARGIN);
}

/**
 * Le libellé sert aussi de clé de regroupement, et c'est voulu : deux pistes
 * qui s'afficheraient pareil sont la même entrée pour l'utilisateur, quel que
 * soit leur débit. La cadence n'entre dans la clé que par « haute ou non »,
 * pour ne pas éclater le menu sur des 59,94 contre 60.
 */
function qualityLabel(height: number, frameRate: number | null): string {
  return (frameRate ?? 0) > HIGH_FRAME_RATE ? `${height}p60` : `${height}p`;
}

function buildCapabilities(player: shaka.Player, abrEnabled: boolean): EngineCapabilities {
  const tracks = player.getVariantTracks();

  const byLabel = new Map<string, QualityLevel>();
  for (const track of tracks) {
    const { height } = track;
    // Sans hauteur, il n'y a rien à afficher : piste audio seule, ou manifeste
    // qui ne déclare pas ses dimensions.
    if (height === null) continue;
    const label = qualityLabel(height, track.frameRate);
    const kept = byLabel.get(label);
    // Entre deux variantes qui s'affichent pareil, on garde la mieux dotée :
    // c'est celle qu'on attend en demandant « 1080p » explicitement.
    if (kept && (kept.bitrate ?? 0) >= track.bandwidth) continue;
    byLabel.set(label, { id: String(track.id), height, bitrate: track.bandwidth, label });
  }

  const qualities = [...byLabel.values()].sort(
    (a, b) => b.height - a.height || (b.bitrate ?? 0) - (a.bitrate ?? 0),
  );

  // La piste réellement jouée n'est pas forcément celle qu'on a retenue pour sa
  // hauteur : en adaptatif, Shaka descend volontiers sur une variante de même
  // hauteur et de débit moindre. On la ramène donc à l'entrée qui la
  // représente, sans quoi le menu n'aurait rien à cocher.
  const playing = tracks.find((track) => track.active && track.height !== null);
  const playingHeight = playing?.height ?? null;
  const playingQualityId =
    playing && playingHeight !== null
      ? (byLabel.get(qualityLabel(playingHeight, playing.frameRate))?.id ?? null)
      : null;

  return {
    qualities,
    // En adaptatif, rien n'est « choisi » : c'est ce `null` qui fait cocher
    // « Auto », pendant que `playingQualityId` remplit la parenthèse.
    activeQualityId: abrEnabled ? null : playingQualityId,
    playingQualityId,
    isLive: player.isLive(),
  };
}

function sameQualities(a: readonly QualityLevel[], b: readonly QualityLevel[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((quality, index) => {
    const other = b[index];
    return (
      quality.id === other.id &&
      quality.height === other.height &&
      quality.bitrate === other.bitrate &&
      quality.label === other.label
    );
  });
}

/**
 * `getCapabilities()` est lu par un store React, et l'adaptatif fait parler le
 * moteur à chaque segment. Renvoyer un objet neuf à chaque fois re-rendrait
 * tous les contrôles en continu : on ne remplace la valeur mémorisée que
 * lorsqu'elle a réellement changé.
 */
function sameCapabilities(a: EngineCapabilities, b: EngineCapabilities): boolean {
  return (
    a.activeQualityId === b.activeQualityId &&
    a.playingQualityId === b.playingQualityId &&
    a.isLive === b.isLive &&
    sameQualities(a.qualities, b.qualities)
  );
}

/** La forme d'une `shaka.util.Error`, reconnue sans dépendre du module. */
interface ShakaErrorLike {
  severity: number;
  category: number;
  code: number;
}

function isShakaError(cause: unknown): cause is ShakaErrorLike {
  if (typeof cause !== "object" || cause === null) return false;
  const candidate = cause as Partial<ShakaErrorLike>;
  return typeof candidate.category === "number" && typeof candidate.code === "number";
}

/**
 * `use-player` transforme tout rejet de `load()` en `PlayerError` de code
 * `engine` et n'en garde que le message : c'est donc ici, et nulle part
 * ailleurs, qu'il faut le rendre lisible. Le couple catégorie/code de Shaka y
 * reste : c'est la seule prise pour diagnostiquer un manifeste qui refuse.
 */
function engineErrorMessage(namespace: ShakaNamespace | null, cause: unknown): string {
  if (isShakaError(cause)) {
    if (namespace && cause.category === namespace.util.Error.Category.NETWORK) {
      return `The manifest or a segment could not be downloaded (network error ${cause.code}).`;
    }
    return `This source could not be played (Shaka error ${cause.category}.${cause.code}).`;
  }
  return cause instanceof Error ? cause.message : "The video engine could not load the source.";
}

export function createShakaEngine(source: SourceType): PlayerEngine {
  let video: HTMLVideoElement | null = null;
  let player: shaka.Player | null = null;
  /** Le moteur natif, quand Shaka ne peut pas tourner du tout sur ce navigateur. */
  let fallback: PlayerEngine | null = null;
  let unsubscribeFallback: (() => void) | null = null;
  let destroyed = false;
  /**
   * Shaka démarre en adaptatif. On suit notre propre drapeau plutôt que de
   * relire la configuration : `getConfiguration()` en clone l'intégralité, et
   * cette valeur est lue à chaque changement de piste.
   */
  let abrEnabled = true;
  let capabilities: EngineCapabilities = NO_CAPABILITIES;
  const listeners = new Set<() => void>();
  /** Le rejet du `load()` en cours, tant qu'il y en a un. */
  let failLoad: ((cause: unknown) => void) | null = null;

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const refresh = () => {
    if (!player) return;
    const next = buildCapabilities(player, abrEnabled);
    if (sameCapabilities(capabilities, next)) return;
    capabilities = next;
    notify();
  };

  return {
    source,

    attach(element) {
      video = element;
    },

    async load(src) {
      const element = video;
      if (!element) {
        throw new Error("The Shaka engine has no element: call attach() before load().");
      }

      let namespace: ShakaNamespace | null = null;
      try {
        namespace = await importShaka();
        // Le composant a pu se démonter pendant l'import : il n'y a alors plus
        // rien à charger, et rien qui ait échoué non plus.
        if (destroyed) return;

        if (!namespace.Player.isBrowserSupported()) {
          // Ni MSE ni Managed Media Source : Shaka ne peut pas tourner ici. On
          // rend la main à la balise plutôt que d'échouer — elle lit le HLS
          // nativement là où ça arrive, et un lecteur qui joue vaudra toujours
          // mieux qu'un lecteur qui explique pourquoi il ne joue pas.
          const native = createNativeEngine(source);
          fallback = native;
          unsubscribeFallback = native.subscribe(notify);
          native.attach(element);
          await native.load(src);
          return;
        }

        // Le constructeur accepte encore l'élément, mais c'est déprécié : la
        // forme vivante est `attach()`, qui rend la main quand l'élément est
        // réellement pris en charge.
        const instance = new namespace.Player();
        player = instance;

        // Shaka ne gère jamais le texte. Les sous-titres et les chapitres
        // passent par `<track>` et l'API `TextTrack`, identiquement dans les
        // deux moteurs ; le laisser faire ferait apparaître les pistes en
        // double sur HLS et pas du tout sur MP4, soit l'inverse exact de la
        // transparence visée.
        instance.configure("manifest.disableText", true);

        instance.addEventListener("trackschanged", refresh);
        instance.addEventListener("variantchanged", refresh);
        instance.addEventListener("adaptation", refresh);
        const critical = namespace.util.Error.Severity.CRITICAL;
        instance.addEventListener("error", (event: Event) => {
          const detail = (event as Event & { detail?: unknown }).detail;
          // Shaka émet aussi les erreurs qu'il a su rattraper — un segment
          // retéléchargé, une clé rejouée. Les remonter ferait échouer une
          // lecture qui repart toute seule.
          if (isShakaError(detail) && detail.severity !== critical) return;
          // Pendant le chargement, c'est ce canal qui porte la panne : on
          // rejette `load()`, que `use-player` traduit en erreur de moteur.
          // Après, `failLoad` est nul et on s'arrête là — ce qui interrompt
          // réellement la lecture finit sur l'élément `<video>`, que
          // `use-player` écoute déjà. Un canal de plus ne dirait rien de neuf.
          failLoad?.(detail ?? event);
        });

        await instance.attach(element);
        if (destroyed) return;

        // `load()` rejette de lui-même sur un manifeste illisible, mais pas sur
        // tout : une erreur émise en parallèle doit pouvoir couper court plutôt
        // que de laisser le poster tourner indéfiniment.
        const failure = new Promise<never>((_, reject) => {
          failLoad = reject;
        });
        await Promise.race([instance.load(src), failure]);
        if (destroyed) return;

        refresh();
      } catch (cause) {
        // Un démontage en cours de route fait rejeter `attach()` ou `load()` :
        // c'est attendu, et ce n'est pas une panne à remonter.
        if (destroyed) return;
        throw new Error(engineErrorMessage(namespace, cause));
      } finally {
        failLoad = null;
      }
    },

    destroy() {
      destroyed = true;
      failLoad = null;
      listeners.clear();
      capabilities = NO_CAPABILITIES;

      video = null;

      unsubscribeFallback?.();
      unsubscribeFallback = null;
      const native = fallback;
      fallback = null;
      const instance = player;
      player = null;

      // Le moteur natif rend déjà l'élément propre : rien à ajouter derrière.
      if (native) {
        native.destroy();
        return;
      }

      // Démontage pendant l'import dynamique : il n'y a jamais eu de lecteur, et
      // Shaka n'a donc rien posé sur la balise. Rien à nettoyer.
      if (!instance) return;

      // On laisse `destroy()` faire, et **on ne touche plus à la balise
      // ensuite** : il détache l'élément et libère `MediaSource` lui-même.
      //
      // Sa promesse est rendue au lecteur, qui attendra avant de brancher le
      // moteur suivant. Les deux moitiés de cette règle ont été mesurées :
      // nettoyer la balise après coup la vidait sous le moteur déjà en place
      // (`emptied`, `readyState 0`), et attacher le suivant sans attendre le
      // laissait bloqué sur « chargement », sans erreur, indéfiniment.
      return instance.destroy().then(
        () => undefined,
        () => undefined,
      );
    },

    getCapabilities() {
      return fallback ? fallback.getCapabilities() : capabilities;
    },

    selectQuality(id) {
      if (fallback) {
        fallback.selectQuality(id);
        return;
      }
      const instance = player;
      if (!instance) return;

      if (id === null) {
        abrEnabled = true;
        instance.configure("abr.enabled", true);
        refresh();
        return;
      }

      const track = instance.getVariantTracks().find((candidate) => String(candidate.id) === id);
      // Identifiant inconnu — piste disparue d'un manifeste live, menu en
      // retard d'un rafraîchissement : on ne fait rien plutôt que de couper
      // l'adaptatif pour une piste qui n'existe plus.
      if (!track) return;

      abrEnabled = false;
      instance.configure("abr.enabled", false);
      // `clearBuffer` à vrai : le changement doit se voir tout de suite, comme
      // sur YouTube. Sans lui, la nouvelle qualité n'arrive qu'une fois épuisé
      // ce qui est déjà téléchargé — plusieurs dizaines de secondes de retard.
      // La marge, elle, évite de laisser la balise sans image : voir
      // `switchSafeMargin`.
      instance.selectVariantTrack(track, true, switchSafeMargin(instance));
      refresh();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
