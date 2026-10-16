import {
  memo,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
} from "react";
import { ChevronLeftIcon, ChevronRightIcon, SettingsIcon } from "./player-icons";

import { useControlsOptions } from "./controls-context";
import { usePlayerActions, usePlayerValue } from "./player-context";
import {
  focusInitialItem,
  PlayerMenu,
  PlayerMenuContent,
  PlayerMenuItem,
  PlayerMenuRadioItem,
  PlayerMenuTrigger,
} from "./player-menu";
import type { PlayerState } from "./player-state-store";

/**
 * Le menu de réglages : un bouton, un popup à deux niveaux. La racine liste les
 * réglages avec leur valeur courante, et chaque ligne ouvre sa liste de choix.
 * Il remplace les deux boutons de vitesse et de qualité d'avant — leurs
 * libellés tenaient trop de place dans une barre étroite.
 *
 * Aucune prop : le contrôle lit ses options et son état dans les contextes.
 * `playbackRate` et `quality` décident des lignes ; sans l'une ni l'autre, il
 * se rend `null`.
 *
 * **La ligne « Quality » reste affichée quand le moteur n'expose aucune
 * qualité**, et passe grisée — c'est le cas d'un MP4 progressif, où le
 * navigateur ne dit rien du contenu du fichier. Une ligne qui disparaît
 * déplace les autres et laisse croire à une panne ; grisée, elle dit qu'il n'y
 * a rien à choisir ici. Le moteur ne se connaît pas ici : on lit seulement ses
 * capacités.
 */

type View = "root" | "speed" | "quality";

/** Le libellé du choix automatique, seul ou suivi de ce qui est joué. */
const AUTO = "Auto";

/**
 * Point décimal et signe « × », quelle que soit la locale du navigateur : la
 * vitesse n'est pas une mesure mais une étiquette, et `0,5×` à côté de `1×`
 * dans la même liste donnerait deux écritures pour une même idée. Le `×` plutôt
 * que la lettre `x` parce qu'un lecteur d'écran le dit « times ».
 */
function formatRate(rate: number): string {
  return `${rate}×`;
}

function selectCapabilities(state: PlayerState) {
  return state.capabilities;
}

export const SettingsMenu = memo(function SettingsMenu(): ReactElement | null {
  const { playbackRate: rateOptions, quality: qualityOptions } = useControlsOptions();
  const capabilities = usePlayerValue(selectCapabilities);

  if (!rateOptions.enabled && !qualityOptions.enabled) return null;

  // Seule la qualité peut être grisée. Quand elle l'est et qu'elle est seule, le
  // popup ne mènerait nulle part : c'est alors le bouton qui se grise.
  const hasActionableRow =
    rateOptions.enabled || (qualityOptions.enabled && capabilities.qualities.length > 0);

  return (
    <PlayerMenu>
      <PlayerMenuTrigger aria-label="Settings" disabled={!hasActionableRow}>
        <SettingsIcon />
      </PlayerMenuTrigger>
      {/* Plus large que le défaut : « Quality » et « Auto (720p) » sur une même
          ligne, chevron compris. */}
      <PlayerMenuContent className="min-w-48">
        <SettingsPanel />
      </PlayerMenuContent>
    </PlayerMenu>
  );
});

/**
 * Le contenu du popup. Monté seulement ouvert, donc `view` repart de la racine
 * à chaque ouverture sans qu'il y ait rien à remettre à zéro.
 */
function SettingsPanel(): ReactElement {
  const { playbackRate: rateOptions, quality: qualityOptions } = useControlsOptions();
  const playbackRate = usePlayerValue((state) => state.playbackRate);
  const capabilities = usePlayerValue(selectCapabilities);
  const { setPlaybackRate, selectQuality } = usePlayerActions();
  const [view, setView] = useState<View>("root");
  const panelRef = useRef<HTMLDivElement>(null);
  const previousViewRef = useRef<View>("root");

  // Le focus était sur l'item de la vue précédente, que React vient de
  // démonter : il est retombé sur le `body`. On le repose avant la peinture.
  useLayoutEffect(() => {
    const previous = previousViewRef.current;
    previousViewRef.current = view;
    // Au montage, c'est le popup qui pose le focus.
    if (previous === view) return;

    const panel = panelRef.current;
    if (!panel) return;
    if (view === "root") {
      // On revient sur la ligne d'où l'on est parti.
      const rows = panel.querySelectorAll<HTMLElement>('[role="menuitem"]');
      rows[previous === "quality" && rateOptions.enabled ? 1 : 0]?.focus();
      return;
    }
    focusInitialItem(panel, "checked");
  }, [rateOptions.enabled, view]);

  const { qualities, activeQualityId, playingQualityId } = capabilities;
  const playing = qualities.find((level) => level.id === playingQualityId);
  const selected = qualities.find((level) => level.id === activeQualityId);

  // `←`/`→` sont arrêtés par le popup pour que la vidéo n'avance pas ; ici on
  // leur donne un sens, celui des chevrons : en RTL, ils sont retournés et les
  // touches avec eux. La direction se lit à chaque touche, sans état, pour
  // suivre un `dir` changé en cours de route (`:dir()` lève avant Chrome 120).
  // Le popup les arrête encore après nous.
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const openKey = rtl ? "ArrowLeft" : "ArrowRight";
    const backKey = rtl ? "ArrowRight" : "ArrowLeft";
    if (event.key === openKey && view === "root") {
      const active = document.activeElement;
      // Un clic : la ligne focalisée sait elle-même quelle vue ouvrir.
      if (active instanceof HTMLElement && panelRef.current?.contains(active)) active.click();
    } else if (event.key === backKey && view !== "root") {
      setView("root");
    }
  };

  return (
    // `role="none"` : cette enveloppe n'existe que pour porter la ref et les
    // touches, le menu doit continuer à contenir directement ses items.
    <div ref={panelRef} role="none" onKeyDown={handleKeyDown}>
      {view === "root" ? (
        <>
          {rateOptions.enabled ? (
            <PlayerMenuItem onSelect={() => setView("speed")}>
              <span>Speed</span>
              <span dir="ltr" className="ml-auto text-muted-foreground">
                {formatRate(playbackRate)}
              </span>
              <RowChevron />
            </PlayerMenuItem>
          ) : null}
          {qualityOptions.enabled ? (
            <PlayerMenuItem disabled={qualities.length === 0} onSelect={() => setView("quality")}>
              <span>Quality</span>
              {/* En automatique, la hauteur jouée : c'est la seule façon de
                  savoir ce qu'on regarde sans quitter l'auto. */}
              <span dir="ltr" className="ml-auto text-muted-foreground">
                {selected ? selected.label : playing ? `${AUTO} (${playing.label})` : AUTO}
              </span>
              <RowChevron />
            </PlayerMenuItem>
          ) : null}
        </>
      ) : null}
      {view === "speed" ? (
        <>
          <BackItem title="Speed" onSelect={() => setView("root")} />
          {rateOptions.rates.map((rate) => (
            <PlayerMenuRadioItem
              key={rate}
              // Rien n'oblige la vitesse courante à figurer dans la liste — la
              // vidéo peut arriver avec la sienne. Aucun item n'est alors coché,
              // et la liste s'ouvre sur la ligne de retour.
              checked={rate === playbackRate}
              onSelect={() => setPlaybackRate(rate)}
            >
              {/* `dir="ltr"` : sous une page RTL, l'algorithme bidi afficherait
                  `×1` au lieu de `1×`. */}
              <span dir="ltr">{formatRate(rate)}</span>
            </PlayerMenuRadioItem>
          ))}
        </>
      ) : null}
      {view === "quality" ? (
        <>
          <BackItem title="Quality" onSelect={() => setView("root")} />
          <PlayerMenuRadioItem
            checked={activeQualityId === null}
            onSelect={() => selectQuality(null)}
          >
            <span dir="ltr">{playing ? `${AUTO} (${playing.label})` : AUTO}</span>
          </PlayerMenuRadioItem>
          {qualities.map((level) => (
            <PlayerMenuRadioItem
              key={level.id}
              checked={level.id === activeQualityId}
              onSelect={() => selectQuality(level.id)}
            >
              <span dir="ltr">{level.label}</span>
            </PlayerMenuRadioItem>
          ))}
        </>
      ) : null}
    </div>
  );
}

/** Le chevron de fin de ligne, dans la place que `pr-8` réserve à l'item. */
function RowChevron(): ReactElement {
  return (
    <span className="pointer-events-none absolute right-2 flex items-center justify-center">
      {/* Retourné en RTL : la ligne s'ouvre alors vers l'autre bord. */}
      <ChevronRightIcon className="rtl:rotate-180" />
    </span>
  );
}

/** La première ligne d'une liste : son titre, et le retour à la racine. */
function BackItem({ title, onSelect }: { title: string; onSelect: () => void }): ReactElement {
  return (
    <PlayerMenuItem className="font-medium" onSelect={onSelect}>
      <ChevronLeftIcon className="rtl:rotate-180" />
      <span>{title}</span>
    </PlayerMenuItem>
  );
}
