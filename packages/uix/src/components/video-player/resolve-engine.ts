import { createNativeEngine } from "./native-engine";
import type { PlayerEngine, SourceType } from "./player-engine";
import { createShakaEngine } from "./shaka-engine";
import { createYoutubeEngine, isYoutube } from "./youtube-engine";

/**
 * Le seul endroit où un moteur est choisi, et le seul qui connaisse les
 * implémentations. `player-engine.ts` reste un contrat sans aucun import :
 * c'est ce qui permet à chaque moteur de l'importer sans fermer de cycle.
 */

/**
 * Détection par l'extension. Elle se trompe sur les URL signées, sans extension
 * ou trompeuses : c'est à ça que sert la prop d'échappement `type`, qui la
 * court-circuite.
 */
export function detectSourceType(src: string): SourceType {
  if (isYoutube(src)) return "youtube";
  const path = src.split(/[?#]/)[0].toLowerCase();
  if (path.endsWith(".m3u8")) return "hls";
  if (path.endsWith(".mpd")) return "dash";
  return "native";
}

/**
 * Le HLS et le DASH passent par Shaka — adaptatif, live et DVR, et surtout
 * l'absorption des divergences MSE d'un navigateur à l'autre. Tout le reste
 * demeure sur la balise seule : Shaka sait retomber sur `src=` là où MSE
 * manque, ce n'est pas une raison de lui faire passer les fichiers
 * progressifs, qui n'ont besoin d'aucun JavaScript de streaming.
 */
export function resolveEngine(src: string, type?: SourceType): PlayerEngine {
  const source = type ?? detectSourceType(src);
  if (source === "youtube") return createYoutubeEngine();
  return source === "native" ? createNativeEngine(source) : createShakaEngine(source);
}
