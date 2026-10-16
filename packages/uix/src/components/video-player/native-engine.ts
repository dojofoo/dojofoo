import { NO_CAPABILITIES } from "./player-engine";
import type { PlayerEngine, SourceType } from "./player-engine";

/**
 * Le moteur du cas le plus fréquent : la balise `<video>` toute seule. Il ne
 * fait rien de plus que poser une source, et c'est exactement ce qu'on lui
 * demande — aucun JavaScript de streaming, rien ajouté au bundle.
 */
export function createNativeEngine(source: SourceType): PlayerEngine {
  let video: HTMLVideoElement | null = null;
  const listeners = new Set<() => void>();

  return {
    source,

    attach(element) {
      video = element;
    },

    load(src) {
      if (!video) {
        return Promise.reject(
          new Error("The native engine has no element: call attach() before load()."),
        );
      }
      video.src = src;
      // `load()` force le navigateur à reprendre l'algorithme de sélection de
      // ressource ; sans lui, réécrire `src` sur un élément déjà chargé peut
      // rester sans effet.
      video.load();
      // La source est posée, donc le contrat de `load` est rempli. La lecture,
      // elle, n'est possible que plus tard : ce sont les événements de
      // `<video>` qui le disent, pas cette promesse.
      return Promise.resolve();
    },

    destroy() {
      if (video) {
        // Retirer l'attribut puis recharger est le seul moyen de faire lâcher
        // le flux au navigateur. `video.src = ""` déclencherait une requête
        // vers l'URL de la page.
        video.removeAttribute("src");
        video.load();
      }
      video = null;
      listeners.clear();
    },

    /*
     * Les trois méthodes qui suivent sont inertes ici, et c'est structurel :
     * le navigateur ne dit rien du contenu d'un MP4 progressif. Pas de liste de
     * pistes, donc rien à sélectionner, et rien qui puisse changer en cours de
     * lecture — d'où un `subscribe` qui enregistre sans jamais émettre.
     *
     * C'est le moteur Shaka de la phase 4 qui les remplira : il découvre les
     * qualités après l'analyse du manifeste, les fait varier en adaptatif et
     * connaît le live. Les abonnés écrits aujourd'hui contre cette interface
     * se réveilleront tout seuls ce jour-là.
     */

    getCapabilities() {
      return NO_CAPABILITIES;
    },

    selectQuality() {},

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
