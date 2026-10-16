import { createContext, useContext, useEffect, type ReactNode } from "react";

import type { ResolvedControlsOptions } from "./controls-options";

/**
 * Ce que la barre distribue à ses contrôles. Conséquence directe : **aucun
 * contrôle ne reçoit de prop**. Chacun lit ce dont il a besoin et se rend
 * `null` si son option est désactivée — ce qui les rend mémoïsables, et ce qui
 * permet d'en écrire plusieurs en parallèle sans contrat entre eux.
 *
 * Trois contextes et non un seul, pour la même raison que dans
 * `player-context.tsx` : ils ne changent pas au même rythme. Les options ne
 * changent jamais, le verrou non plus, la visibilité bascule souvent. Un menu
 * qui pose un verrou n'a aucune raison de se re-rendre parce que la barre vient
 * d'apparaître.
 */

const ControlsOptionsContext = createContext<ResolvedControlsOptions | null>(null);
const ControlsVisibleContext = createContext<boolean | null>(null);
const ControlsHoldContext = createContext<(() => () => void) | null>(null);

export interface ControlsProviderProps {
  options: ResolvedControlsOptions;
  visible: boolean;
  /** Pose un verrou et renvoie sa libération. Référence stable. */
  holdVisible: () => () => void;
  children: ReactNode;
}

export function ControlsProvider({
  options,
  visible,
  holdVisible,
  children,
}: ControlsProviderProps) {
  return (
    <ControlsOptionsContext.Provider value={options}>
      <ControlsHoldContext.Provider value={holdVisible}>
        <ControlsVisibleContext.Provider value={visible}>
          {children}
        </ControlsVisibleContext.Provider>
      </ControlsHoldContext.Provider>
    </ControlsOptionsContext.Provider>
  );
}

function missing(): never {
  throw new Error("The player controls must be rendered inside <VideoCn>.");
}

export function useControlsOptions(): ResolvedControlsOptions {
  return useContext(ControlsOptionsContext) ?? missing();
}

export function useControlsVisible(): boolean {
  const visible = useContext(ControlsVisibleContext);
  if (visible === null) missing();
  return visible;
}

/**
 * Empêche l'auto-masquage tant que `active` est vrai — un menu ouvert ne peut
 * pas voir sa barre disparaître sous lui. Un compteur plutôt qu'un booléen
 * partagé : les phases 4 à 6 ajouteront d'autres menus, et deux verrous posés
 * en même temps ne doivent pas s'écraser l'un l'autre.
 */
export function useHoldControlsVisible(active: boolean): void {
  const holdVisible = useContext(ControlsHoldContext) ?? missing();

  useEffect(() => {
    if (!active) return;
    return holdVisible();
  }, [active, holdVisible]);
}
