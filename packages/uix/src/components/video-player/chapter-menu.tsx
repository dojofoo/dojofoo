import { memo, type ReactElement } from "react";
import { ListIcon } from "./player-icons";

import { useActiveChapterIndex, useChapters } from "./chapters-context";
import { useControlsOptions } from "./controls-context";
import { formatSpokenTime, formatTime } from "./format-time";
import { usePlayerActions, usePlayerValue } from "./player-context";
import {
  PlayerMenu,
  PlayerMenuContent,
  PlayerMenuRadioItem,
  PlayerMenuTrigger,
} from "./player-menu";
import type { PlayerState } from "./player-state-store";

/**
 * Le menu des chapitres : la liste des titres, et un clic pour sauter au
 * début de l'un d'eux.
 *
 * **Il disparaît quand il n'y a rien à lister**, là où le sélecteur de qualité
 * reste affiché et grisé. Les deux règles ne se contredisent pas, elles
 * suivent la donnée : toute vidéo a une qualité — un MP4 progressif
 * n'en expose simplement aucune, et le bouton grisé dit justement ça —, alors
 * que les chapitres sont une donnée optionnelle que la plupart des vidéos
 * n'auront jamais. Un bouton mort sur chaque lecteur serait du bruit permanent
 * pour une fonction rare.
 *
 * La liste arrive déjà normalisée, triée et bornée par le contexte, et elle est
 * vide dès que la durée est inconnue — le direct tombe dans ce cas tout seul.
 * Il n'y a donc ici aucun cas particulier à traiter : quand on rend quelque
 * chose, la durée est finie et les horodatages sont calculables.
 */

function selectDuration(state: PlayerState): number {
  return state.duration;
}

export const ChapterMenu = memo(function ChapterMenu(): ReactElement | null {
  const { chapters: chapterOptions } = useControlsOptions();
  const chapters = useChapters();
  const activeIndex = useActiveChapterIndex();
  const duration = usePlayerValue(selectDuration);
  const { seek } = usePlayerActions();

  if (!chapterOptions.enabled || chapters.length === 0) return null;

  // `-1` avant les premières métadonnées, ou si la tête de lecture n'est pas
  // encore retombée dans un chapitre : le bouton s'annonce alors sans titre.
  const active = activeIndex === -1 ? null : chapters[activeIndex];

  return (
    <PlayerMenu>
      {/* Icône seule, sans libellé visible : le titre du chapitre courant
          change au fil de la lecture, et avec lui la largeur du bouton — les
          cibles cliquables voisines se déplaceraient sous le doigt. C'est la
          raison qui range déjà l'horodatage après le volume. Le nom
          accessible, lui, peut porter le titre : il ne mesure rien. */}
      <PlayerMenuTrigger aria-label={active ? `Chapters, ${active.label}` : "Chapters"}>
        <ListIcon />
      </PlayerMenuTrigger>
      <PlayerMenuContent>
        {chapters.map((chapter, index) => (
          // `PlayerMenuRadioItem` et non un item simple : le chapitre courant
          // est un état, il se coche — et le menu s'ouvre alors tout seul sur
          // lui, sans qu'on ait à parcourir la liste pour se retrouver.
          // L'item coché reste sélectionnable : y cliquer reprend le chapitre
          // à son début, ce qu'on vient souvent chercher ici.
          <PlayerMenuRadioItem
            key={chapter.start}
            checked={index === activeIndex}
            onSelect={() => seek(chapter.start)}
          >
            {/* Le titre garde la direction de la page : il vient de
                l'intégrateur et peut être écrit en arabe. Il vient aussi en
                premier, ce qui laisse la saisie rapide du menu — qui compare
                le texte de l'item — filtrer sur le titre. */}
            <span>{chapter.label}</span>
            {/* La durée en seconde référence et non le début : toute la
                colonne prend alors la même écriture, et `0:42` ne voisine pas
                `1:02:13`. `dir="ltr"` parce que ce sont des chiffres — sous
                une page RTL, l'algorithme bidi afficherait `42:0`. */}
            <span
              aria-hidden="true"
              dir="ltr"
              className="ml-auto shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums"
            >
              {formatTime(chapter.start, duration)}
            </span>
            {/* Lu tel quel, `2:15` devient « deux deux-points quinze » ou une
                heure de la journée. Le lecteur d'écran reçoit donc la forme
                parlée à la place — à la place du seul horodatage, pas du
                titre : ce que l'utilisateur lit doit rester ce qu'il peut
                dire. */}
            <span className="sr-only">{formatSpokenTime(chapter.start)}</span>
          </PlayerMenuRadioItem>
        ))}
      </PlayerMenuContent>
    </PlayerMenu>
  );
});
