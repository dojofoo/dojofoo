import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

import {
  findChapterIndex,
  NO_CHAPTERS,
  resolveChapters,
  type Chapter,
  type ResolvedChapter,
} from "./chapters";
import { usePlayerValue, usePlayheadValue } from "./player-context";
import { displayedTime, type PlayheadSnapshot } from "./playhead-store";

/**
 * La liste des chapitres, distribuée déjà normalisée.
 *
 * Le contexte ne porte pas la prop brute mais son résultat : la normalisation
 * a lieu une fois, ici, et non dans chaque consommateur. La piste et le menu
 * reçoivent alors **la même référence**, ce qui les rend mémoïsables et permet
 * à l'effet qui peint les segments de ne tourner qu'au changement de vidéo.
 */

const ChaptersContext = createContext<readonly ResolvedChapter[] | null>(null);

/**
 * Ce qui identifie une liste, indépendamment de la référence du tableau.
 *
 * `<VideoCn chapters={[…]} />` fabrique un tableau neuf à chaque rendu de la
 * page hôte — c'est la façon normale d'écrire du JSX, et on ne va pas demander
 * à l'utilisateur de mémoïser sa liste pour que le lecteur se tienne bien. On
 * compare donc le contenu, pas l'adresse.
 */
function signChapters(chapters: readonly Chapter[] | undefined, duration: number): string {
  if (!chapters || chapters.length === 0) return `${duration}`;
  // Deux séparateurs qu'un libellé ne peut pas contenir : sans eux, un titre
  // portant le séparateur pourrait imiter la signature d'une autre liste.
  return `${duration}\u0001${chapters.map((chapter) => `${chapter?.time}\u0000${chapter?.label}`).join("\u0001")}`;
}

export interface ChaptersProviderProps {
  chapters?: readonly Chapter[];
  children: ReactNode;
}

export function ChaptersProvider({ chapters, children }: ChaptersProviderProps) {
  // La durée est ce qui donne sa fin au dernier chapitre. Elle arrive après le
  // montage, et change une fois par source : s'y abonner ici coûte un rendu de
  // la barre par vidéo.
  const duration = usePlayerValue((state) => state.duration);
  const signature = signChapters(chapters, duration);

  // L'état ajusté pendant le rendu, motif documenté par React. C'est ce qui
  // donne une **référence stable** entre deux rendus de l'hôte : un `useMemo`
  // sur la prop rendrait un tableau neuf à chaque fois — la prop en est un —,
  // et un effet ferait rendre une fois la liste vide avant la vraie.
  const [cache, setCache] = useState(() => ({
    signature,
    resolved: resolveChapters(chapters, duration),
  }));

  // Recalculée et rendue dans la foulée : la liste juste part dans le contexte
  // dès ce rendu-ci, et l'état la garde pour les suivants. Le rendu que
  // provoque `setCache` retrouve alors cette même référence et ne réveille
  // personne.
  let resolved = cache.resolved;
  if (cache.signature !== signature) {
    resolved = resolveChapters(chapters, duration);
    setCache({ signature, resolved });
  }

  return <ChaptersContext.Provider value={resolved}>{children}</ChaptersContext.Provider>;
}

/**
 * La liste normalisée. Vide quand il n'y a rien à découper — pas de prop,
 * durée inconnue, ou flux en direct.
 */
export function useChapters(): readonly ResolvedChapter[] {
  return useContext(ChaptersContext) ?? NO_CHAPTERS;
}

/**
 * L'index du chapitre en cours, ou `-1`.
 *
 * Le sélecteur rend un nombre, donc l'abonnement ne réveille son lecteur qu'au
 * franchissement d'une frontière de chapitre — pas soixante fois par seconde.
 * C'est la même discipline que partout ailleurs dans le lecteur : on s'abonne à
 * ce qu'on affiche, jamais à la tête de lecture brute.
 *
 * `displayedTime` et non `currentTime` : pendant un glissement, le menu doit
 * suivre le doigt, comme le reste.
 */
export function useActiveChapterIndex(): number {
  const chapters = useChapters();
  const select = useCallback(
    (snapshot: PlayheadSnapshot) => findChapterIndex(chapters, displayedTime(snapshot)),
    [chapters],
  );
  return usePlayheadValue(select);
}
