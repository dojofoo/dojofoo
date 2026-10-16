import { useLayoutEffect, useRef, type ReactNode } from "react";

import { useChapters } from "./chapters-context";
import { useControlsOptions } from "./controls-context";

/**
 * Le découpage de la piste en segments de chapitres, et la piste elle-même.
 *
 * Ce fichier ne dessine aucune donnée. Il reçoit les couches du scrubber en
 * `children` et les réplique dans chaque segment : le scrubber reste
 * propriétaire de ce qui est peint — l'aperçu du buffer, la partie jouée — et
 * n'a jamais à savoir où tombent les coupures.
 *
 * **Chaque segment est une fenêtre sur la piste entière.** La barre visible
 * clippe ; le calque qu'elle contient reconstitue la largeur totale et se
 * recale dessous. Les couches répliquées lisent alors
 * `--player-slider-fraction` et `--player-buffer-start/end` telles quelles,
 * sans une seule opération de plus. C'est ce qui permet au curseur de garder un
 * écrivain unique pour sa fraction : un découpage qui aurait exigé une fraction
 * par segment aurait demandé de la réécrire autant de fois, soixante fois par
 * seconde.
 *
 * **Trois boîtes par chapitre, et chacune a une raison.** La *zone* fait toute
 * la hauteur du curseur et ne se voit pas : c'est elle qu'on survole, parce
 * qu'une barre de quatre pixels ne se vise pas. La *barre* est ce qu'on voit,
 * centrée dans la zone. Le *calque*, dedans, porte la piste entière re-cadrée.
 *
 * **Les zones se touchent, l'écart est pris sur la barre.** Rien à survoler
 * entre deux chapitres, donc : l'épaisseur ne retombe pas le temps d'un pixel
 * quand on balaie la barre.
 *
 * **L'écart est retranché de la largeur de la barre, jamais posé en marge.** Le
 * calque se comprime alors d'autant, et la partie jouée vaut exactement zéro au
 * début d'un chapitre et exactement la largeur visible à sa fin. Une marge, à
 * l'inverse, aurait laissé le calque à la largeur de la piste : le remplissage
 * aurait dérivé d'un écart cumulé, de plus en plus faux vers la fin.
 *
 * **Aucune branche « sans chapitres ».** Rien à découper — pas de liste, durée
 * inconnue, direct, ou option coupée — rend un segment unique de 0 à 1 avec un
 * écart nul, et le calcul redonne exactement la piste d'un seul tenant. Le
 * chemin par défaut est donc celui qu'on regarde tous les jours ; il ne peut
 * pas pourrir sans qu'on le voie.
 */

const START_PROPERTY = "--chapter-start";
const SPAN_PROPERTY = "--chapter-span";
const GAP_PROPERTY = "--chapter-gap";

/**
 * L'écart entre deux barres, et son absence après la dernière.
 *
 * Deux pixels : la plus petite coupure qui se lise encore sur une piste haute
 * de quatre. Et rien après le dernier segment — la barre s'arrêterait deux
 * pixels avant son bord, et la fin de la vidéo ne serait jamais atteinte à
 * l'œil, alors que c'est précisément le moment où on la regarde.
 */
const SEGMENT_GAP = "2px";
const NO_GAP = "0px";

/**
 * Ce que le découpage lit d'un chapitre : deux fractions, rien d'autre.
 *
 * `ResolvedChapter` s'y conforme, et la piste d'un seul tenant aussi — sans
 * qu'on ait à fabriquer un faux chapitre avec des secondes et un libellé vides
 * dont personne ne saurait quoi faire.
 */
interface Segment {
  fraction: number;
  span: number;
}

/** La piste d'un seul tenant, dite comme un chapitre unique qui couvre tout. */
const WHOLE_TRACK: readonly Segment[] = Object.freeze([Object.freeze({ fraction: 0, span: 1 })]);

export interface ChapterSegmentsProps {
  /** Les couches à répliquer dans chaque segment. */
  children: ReactNode;
}

export function ChapterSegments({ children }: ChapterSegmentsProps) {
  const chapters = useChapters();
  const { scrubber } = useControlsOptions();
  const containerRef = useRef<HTMLDivElement>(null);

  // Deux références stables et rien d'autre : celle que le contexte garde pour
  // toute la vidéo, ou la constante du module. L'effet ci-dessous ne tourne
  // donc qu'au changement de vidéo, et non à chaque seconde rendue par le
  // scrubber.
  const segments: readonly Segment[] =
    scrubber.chapters && chapters.length > 0 ? chapters : WHOLE_TRACK;

  // Un seul chapitre ne se distingue pas de lui-même : sans découpage, survoler
  // la barre l'épaissit une fois, comme avant les chapitres. Sans cette
  // réserve, une vidéo sans chapitres verrait sa barre monter à dix pixels.
  const distinguishable = segments.length > 1;

  // Un seul effet plutôt qu'une ref par segment : la liste ne change qu'avec la
  // vidéo, et chaque élément garde au plus un écrivain impératif — la règle qui
  // vaut déjà pour la fraction du curseur et pour les bornes du buffer.
  //
  // En layout effect, comme la fraction du curseur : le rendu qui suit
  // l'arrivée de la durée fait apparaître les N segments d'un coup, tous sur
  // leurs valeurs par défaut, c'est-à-dire empilés à gauche et larges comme la
  // piste. Écrire après la peinture montrerait cette frame-là.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const last = segments.length - 1;
    segments.forEach((segment, index) => {
      const element = container.children[index];
      if (!(element instanceof HTMLElement)) return;
      // Sans unité : ce sont des nombres, et `--chapter-span` sert de diviseur.
      element.style.setProperty(START_PROPERTY, String(segment.fraction));
      element.style.setProperty(SPAN_PROPERTY, String(segment.span));
      element.style.setProperty(GAP_PROPERTY, index === last ? NO_GAP : SEGMENT_GAP);
    });
  }, [segments]);

  return (
    // La piste tient toute la hauteur du curseur, et c'est elle qu'on survole :
    // le verrou de l'épaisseur générale est donc ici, et non sur la racine du
    // curseur, qu'on n'a pas à toucher. `data-dragging` le tient aussi, sans
    // quoi la barre maigrirait dès que le doigt sort du lecteur en glissant.
    <div
      data-slot="video-player-scrubber-chapters"
      ref={containerRef}
      className="absolute inset-0 hover:[--scrubber-lift:0.125rem] group-data-dragging/slider:[--scrubber-lift:0.125rem]"
    >
      {segments.map((segment) => (
        // Le début du chapitre comme clé : il est unique par construction — deux
        // chapitres au même instant ne survivent pas à la normalisation.
        //
        // La zone de survol : toute la hauteur, aucune apparence, et elle touche
        // ses voisines. `items-center` centre la barre sans `translate`, que la
        // conversion RTL du CLI réécrirait.
        <div
          key={segment.fraction}
          data-slot="video-player-scrubber-chapter"
          className={
            distinguishable
              ? "absolute inset-y-0 left-[calc(var(--chapter-start,0)*100%)] flex w-[calc(var(--chapter-span,1)*100%)] items-center hover:[--chapter-lift:0.25rem]"
              : "absolute inset-y-0 left-[calc(var(--chapter-start,0)*100%)] flex w-[calc(var(--chapter-span,1)*100%)] items-center"
          }
        >
          {/* La barre visible. Un plancher de deux pixels : un chapitre plus
              court que l'écart donnerait une largeur négative, donc une barre
              absente. Mieux vaut une marque trop large qu'un trou. */}
          <div
            data-slot="video-player-scrubber-chapter-bar"
            // L'épaisseur est une somme, et c'est délibéré : **deux variables
            // posées sur deux éléments différents**, jamais deux classes de
            // hauteur sur le même. À spécificité égale, entre `hover:` et
            // `group-hover/…`, c'est l'ordre de génération qui tranche — une
            // loterie dont dépendrait l'épaisseur de la barre. La piste pose la
            // sienne, le chapitre visé pose la sienne, et l'addition n'a plus
            // rien à départager : 4 px au repos, 6 px sur la barre, 10 px sur
            // le chapitre survolé. L'écart entre 6 et 10 est voulu large : à
            // deux pixels près, on ne voyait pas lequel on visait.
            // Le rayon vient de l'hôte et non d'un `rounded-full` : sur une
            // barre de quatre pixels, le navigateur écrête le rayon à la moitié
            // de la hauteur, donc `var(--radius)` y dessine exactement la même
            // pilule. La différence n'apparaît qu'au bout de l'échelle — un
            // thème à `--radius: 0` rend un angle vif, comme partout chez lui.
            className="relative h-[calc(0.25rem_+_var(--scrubber-lift,0rem)_+_var(--chapter-lift,0rem))] w-[max(calc(100%_-_var(--chapter-gap,0px)),2px)] shrink-0 overflow-hidden rounded-lg bg-foreground/20 transition-[height] duration-150 motion-reduce:transition-none"
          >
            {/*
              Le calque : la piste entière, reconstituée à l'intérieur de la
              barre et remontée sous sa fenêtre. Il est clippé par
              l'`overflow-hidden` ci-dessus, ce qui laisse ses couches raisonner
              en fractions de la vidéo entière, comme si les chapitres
              n'existaient pas.
            */}
            <div
              data-slot="video-player-scrubber-chapter-canvas"
              className="absolute inset-y-0 left-[calc(var(--chapter-start,0)/var(--chapter-span,1)*-100%)] w-[calc(100%/var(--chapter-span,1))]"
            >
              {children}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
