import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { CheckIcon } from "./player-icons";

import { Button } from "./player-button";
import { cn } from "~/lib/utils";

import { useHoldControlsVisible } from "./controls-context";

/**
 * Un menu déroulant écrit à la main, et non le `DropdownMenu` de shadcn.
 *
 * La raison est unique et suffisante : `DropdownMenuContent` code son portail
 * **en dur** vers `document.body`. Or ce qui est porté sur `body` n'est plus
 * rendu dès qu'un autre élément est en plein écran — et le lecteur passe son
 * conteneur en plein écran, justement pour que la barre y survive. Un menu
 * porté sur `body` serait donc invisible exactement là où on en a le plus
 * besoin. Recomposer par en dessous n'est pas une option : les briques
 * (`Positioner`, `Popup`, `Content` nu) ne sont pas exportées, et la structure
 * interne diverge entre `radix` (`Portal > Content`) et `base`
 * (`Portal > Positioner > Popup`).
 *
 * Ce qui est repris, en revanche, ce sont les classes : elles viennent telles
 * quelles du `dropdown-menu` amont, dont le vocabulaire est identique dans les
 * deux styles. Le menu hérite donc du thème shadcn de l'hôte, et l'utilisateur
 * ne voit pas la différence.
 *
 * Le positionnement se passe de portail : le popup est `absolute` dans un
 * parent `relative`, et s'ouvre vers le haut — la seule direction possible pour
 * une barre en bas, et ce qui le fait vivre en plein écran.
 *
 * L'API est composée, faute de mieux : `asChild` et `render` sont interdits
 * ici (leur nom change d'un style à l'autre), donc les pièces se parlent par un
 * contexte interne plutôt qu'en se déléguant leur rendu.
 */

/** Où poser le focus quand le popup s'ouvre. */
type InitialFocus = "checked" | "first" | "last";

/**
 * Les items sont retrouvés dans le DOM plutôt que tenus dans un registre :
 * quoi qu'on compose plus tard — un groupe, un fragment, un `map`, un item
 * inséré par une phase suivante — l'ordre du DOM reste l'ordre de navigation,
 * et il n'y a aucun inventaire à maintenir en parallèle.
 */
const ITEM_SELECTOR =
  '[role="menuitemradio"]:not([data-disabled]),[role="menuitem"]:not([data-disabled])';

/**
 * Ce que le popup laisse libre de chaque côté dans sa hauteur mesurée : le
 * `mb-2` qui le décolle de son déclencheur, et autant au-dessus, pour qu'il ne
 * touche pas le bord du lecteur.
 */
const POPUP_MARGIN = 16;

/** Au-delà, la frappe suivante repart d'une chaîne vide. */
const TYPEAHEAD_RESET_MS = 500;

/**
 * Relevé dans le `dropdown-menu` amont. Seules les valeurs de rayon diffèrent
 * d'un cran entre `radix` et `base` : un jeu unique donne un rendu juste des
 * deux côtés.
 *
 * L'animation de *sortie* est sciemment abandonnée — la reproduire exigerait de
 * garder le nœud monté pendant la fermeture, avec tout ce que ça suppose de
 * pièges au focus. D'où l'absence de classes `data-closed:*`, qui ne
 * s'appliqueraient jamais.
 */
const POPUP_CLASSNAME =
  "z-50 min-w-32 overflow-x-hidden overflow-y-auto rounded-button-md bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95";

/**
 * Idem. Le `w-full` est le seul ajout : l'amont rend ses items en `div`, qui
 * remplissent leur ligne d'office ; nous rendons des `button`, pour que le
 * focus DOM puisse réellement s'y poser, et il faut le leur demander.
 *
 * Le `pr-8` réserve la place de l'indicateur coché : rien ne bouge quand la
 * sélection change de ligne.
 */
const ITEM_CLASSNAME =
  "relative flex w-full cursor-default items-center gap-1.5 rounded-button-sm py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

interface PlayerMenuContextValue {
  open: boolean;
  triggerId: string;
  contentId: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  /** Lu une fois par le popup à son montage, puis sans effet. */
  initialFocusRef: RefObject<InitialFocus>;
  openMenu: (initialFocus: InitialFocus) => void;
  closeMenu: (restoreFocus: boolean) => void;
}

const PlayerMenuContext = createContext<PlayerMenuContextValue | null>(null);

function useMenu(): PlayerMenuContextValue {
  const context = useContext(PlayerMenuContext);
  if (!context) {
    throw new Error("The menu parts must be rendered inside <PlayerMenu>.");
  }
  return context;
}

function getItems(content: HTMLElement | null): HTMLElement[] {
  if (!content) return [];
  return Array.from(content.querySelectorAll<HTMLElement>(ITEM_SELECTOR));
}

export function focusInitialItem(content: HTMLElement | null, initialFocus: InitialFocus): void {
  const items = getItems(content);
  if (items.length === 0) return;
  if (initialFocus === "last") {
    items[items.length - 1].focus();
    return;
  }
  // Ouvrir sur la valeur courante évite d'avoir à parcourir la liste pour
  // retrouver où l'on en est. À défaut d'item coché, le premier.
  const checked = items.find((item) => item.getAttribute("aria-checked") === "true");
  (initialFocus === "checked" ? (checked ?? items[0]) : items[0]).focus();
}

export interface PlayerMenuProps {
  children: ReactNode;
  className?: string;
}

/**
 * Le cadre et l'état ouvert. `relative`, parce que c'est lui qui sert de
 * référence au popup `absolute`.
 */
export function PlayerMenu({ children, className }: PlayerMenuProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<InitialFocus>("checked");

  // Un menu ouvert ne peut pas voir sa barre s'effacer sous lui.
  useHoldControlsVisible(open);

  const openMenu = useCallback((initialFocus: InitialFocus) => {
    initialFocusRef.current = initialFocus;
    setOpen(true);
  }, []);

  const closeMenu = useCallback((restoreFocus: boolean) => {
    const content = contentRef.current;
    // Le focus ne revient au déclencheur que s'il était **dans** le popup.
    // Sinon on le volerait à l'endroit où l'utilisateur vient de cliquer.
    const shouldRestore =
      restoreFocus && content !== null && content.contains(document.activeElement);
    setOpen(false);
    // Avant que React ne démonte le popup : déplacer le focus après coup
    // n'aurait plus de sens, le navigateur l'aurait déjà renvoyé au `body`.
    if (shouldRestore) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const path = event.composedPath();
      const content = contentRef.current;
      const trigger = triggerRef.current;
      if (content && path.includes(content)) return;
      // Le déclencheur ferme par son propre `onClick` : fermer ici aussi ferait
      // basculer deux fois, et le menu se rouvrirait dans la foulée.
      if (trigger && path.includes(trigger)) return;
      closeMenu(false);
    };

    // `pointerdown` et non `click` : un glisser commencé ailleurs — sur le
    // scrubber, typiquement — doit fermer tout de suite, pas au relâchement.
    // En capture, pour qu'aucun `stopPropagation()` en chemin ne nous empêche
    // de le voir. `composedPath()` plutôt que `contains(event.target)` : il
    // traverse les Shadow DOM, et le lecteur peut être embarqué dans l'un.
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [closeMenu, open]);

  const context = useMemo<PlayerMenuContextValue>(
    () => ({
      open,
      triggerId: `${id}-trigger`,
      contentId: `${id}-content`,
      triggerRef,
      contentRef,
      initialFocusRef,
      openMenu,
      closeMenu,
    }),
    [closeMenu, id, open, openMenu],
  );

  return (
    <PlayerMenuContext.Provider value={context}>
      <div data-slot="player-menu" className={cn("relative", className)}>
        {children}
      </div>
    </PlayerMenuContext.Provider>
  );
}

/**
 * Le type de props est **le nôtre**, étroit, et surtout pas
 * `ComponentProps<typeof Button>` : le `Button` du consommateur n'a pas la même
 * API selon qu'il vient de `radix` ou de `base`. Exposer la sienne reviendrait
 * à exposer cette différence. On encapsule, et on ne laisse passer que ce dont
 * un déclencheur de menu a besoin.
 */
export interface PlayerMenuTriggerProps {
  children: ReactNode;
  className?: string;
  /** Anglais : c'est la langue des libellés du lecteur. */
  "aria-label"?: string;
  disabled?: boolean;
}

export function PlayerMenuTrigger({
  children,
  className,
  disabled,
  "aria-label": ariaLabel,
}: PlayerMenuTriggerProps) {
  const { open, triggerId, contentId, triggerRef, contentRef, openMenu, closeMenu } = useMenu();

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    switch (event.key) {
      case "Enter":
      case " ":
        // `preventDefault` coupe l'activation native du bouton : sans lui,
        // `Entrée` déclencherait aussi un `click`, donc une seconde bascule.
        event.preventDefault();
        event.stopPropagation();
        if (open) closeMenu(false);
        else openMenu("checked");
        break;
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        event.stopPropagation();
        const initialFocus = event.key === "ArrowUp" ? "last" : "checked";
        // Déjà ouvert — le focus n'était pas descendu, faute d'item à
        // l'ouverture, ou il est remonté ici : `openMenu` ne remonterait rien,
        // l'état ne changeant pas. On entre donc directement.
        if (open) focusInitialItem(contentRef.current, initialFocus);
        else openMenu(initialFocus);
        break;
      }
      case "Escape":
        // Un menu peut être ouvert sans contenir d'item focalisable : le focus
        // est resté ici, et c'est donc ici qu'il faut pouvoir refermer.
        if (!open) break;
        event.preventDefault();
        event.stopPropagation();
        closeMenu(false);
        break;
      default:
        break;
    }
  };

  return (
    <Button
      ref={triggerRef}
      id={triggerId}
      type="button"
      variant="ghost"
      // `sm` et non `icon-sm` : aucun déclencheur ne porte plus de texte, mais
      // la largeur reste libre pour qu'un contenu à venir — une icône suivie
      // d'un badge, par exemple — ne soit pas rogné. Même hauteur que les
      // autres boutons de la barre.
      size="sm"
      disabled={disabled}
      aria-label={ariaLabel}
      aria-haspopup="menu"
      aria-expanded={open}
      // Ne pointer que vers un nœud qui existe : le popup n'est monté
      // qu'ouvert.
      aria-controls={open ? contentId : undefined}
      // `aria-expanded:bg-muted` est déjà dans la variante `ghost` des deux
      // styles : l'état ouvert est stylé sans qu'on ait rien à ajouter.
      className={className}
      onClick={() => (open ? closeMenu(true) : openMenu("checked"))}
      onKeyDown={handleKeyDown}
    >
      {children}
    </Button>
  );
}

export interface PlayerMenuContentProps {
  children: ReactNode;
  className?: string;
}

/**
 * Le popup. Monté seulement ouvert — c'est ce montage qui sert de signal
 * d'ouverture au reste du comportement, d'où la séparation en deux composants.
 */
export function PlayerMenuContent(props: PlayerMenuContentProps) {
  const { open } = useMenu();
  if (!open) return null;
  return <PlayerMenuPopup {...props} />;
}

function PlayerMenuPopup({ children, className }: PlayerMenuContentProps) {
  const { triggerId, contentId, triggerRef, contentRef, initialFocusRef, closeMenu } = useMenu();
  // La chaîne de saisie rapide et son minuteur vivent dans une ref : les
  // changer ne doit rien re-rendre, seul le focus bouge.
  const typeaheadRef = useRef({ query: "", timer: 0 });

  // Avant la première peinture : le popup ne doit jamais apparaître à sa
  // hauteur naturelle puis se raccourcir. Le conteneur du lecteur est
  // `overflow-hidden`, et un lecteur étroit est aussi un lecteur bas : le popup,
  // ancré dans la barre, ne connaît pas cette hauteur en CSS. Seule mesure faite
  // en JavaScript ; elle passe par une variable CSS posée à la main et non par
  // un `style` JSX, que le lint interdit et que React réécrirait au rendu.
  useLayoutEffect(() => {
    const content = contentRef.current;
    const trigger = triggerRef.current;
    const player = trigger?.closest('[data-slot="video-player"]');
    if (!content || !trigger || !player) return;
    const room =
      trigger.getBoundingClientRect().top - player.getBoundingClientRect().top - POPUP_MARGIN;
    content.style.setProperty("--player-menu-max-h", `${Math.max(room, 0)}px`);
  }, [contentRef, triggerRef]);

  useEffect(() => {
    // Au montage, donc à l'ouverture. Le focus DOM entre réellement dans le
    // menu : c'est ce qui permet de reprendre le `focus:bg-accent` de l'amont
    // sans l'adapter, et c'est aussi la bonne implémentation accessible.
    focusInitialItem(contentRef.current, initialFocusRef.current);
  }, [contentRef, initialFocusRef]);

  useEffect(() => {
    const typeahead = typeaheadRef.current;
    return () => window.clearTimeout(typeahead.timer);
  }, []);

  const runTypeahead = (character: string) => {
    const typeahead = typeaheadRef.current;
    window.clearTimeout(typeahead.timer);
    typeahead.query += character.toLowerCase();
    typeahead.timer = window.setTimeout(() => {
      typeahead.query = "";
    }, TYPEAHEAD_RESET_MS);

    const match = getItems(contentRef.current).find((item) =>
      (item.textContent ?? "").trim().toLowerCase().startsWith(typeahead.query),
    );
    // Sans correspondance on ne bouge pas le focus, et on garde la chaîne :
    // l'utilisateur est peut-être au milieu d'un mot.
    match?.focus();
  };

  // `stopPropagation()` sur chaque touche traitée. Sans ça, la couche de
  // raccourcis clavier du lecteur verra les flèches pendant la navigation dans
  // le menu et changera le volume sous le nez de l'utilisateur.
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = getItems(contentRef.current);
    const active = document.activeElement;
    const current = items.findIndex((item) => item === active);

    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        event.stopPropagation();
        if (items.length === 0) return;
        const step = event.key === "ArrowDown" ? 1 : -1;
        // Bouclage : du dernier, `↓` revient au premier. Focus hors liste —
        // il n'y était pas encore — on entre par le bout correspondant.
        const next =
          current === -1
            ? step === 1
              ? 0
              : items.length - 1
            : (current + step + items.length) % items.length;
        items[next].focus();
        return;
      }
      case "Home":
      case "End": {
        event.preventDefault();
        event.stopPropagation();
        if (items.length === 0) return;
        (event.key === "Home" ? items[0] : items[items.length - 1]).focus();
        return;
      }
      case "Enter":
      case " ": {
        // Uniformise `Entrée`, qui clique au `keydown`, et `Espace`, qui clique
        // au `keyup` après avoir fait défiler la page : un seul chemin
        // d'activation, et la page ne bouge pas.
        event.preventDefault();
        event.stopPropagation();
        items[current]?.click();
        return;
      }
      case "ArrowLeft":
      case "ArrowRight": {
        // Le popup a le focus : `←`/`→` ne doivent pas faire avancer la vidéo.
        // Un contenu qui s'en sert (les niveaux du menu de réglages) les traite
        // avant nous, depuis ses propres items.
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      case "Escape": {
        event.preventDefault();
        event.stopPropagation();
        closeMenu(true);
        return;
      }
      case "Tab": {
        event.stopPropagation();
        // Pas de `preventDefault` : sortir de la barre au clavier doit rester
        // possible, et c'est la tabulation qui le permet. Mais le focus est sur
        // un item que React s'apprête à démonter ; s'il disparaissait avant que
        // le navigateur n'applique le déplacement, la tabulation repartirait du
        // début du document. On ramène donc le focus au déclencheur, qui lui
        // survit, avant de fermer — il ne s'y arrête pas, il ne fait qu'y
        // transiter, et le déplacement se calcule depuis un nœud vivant.
        triggerRef.current?.focus();
        closeMenu(false);
        return;
      }
      default:
        break;
    }

    // Saisie rapide : un caractère imprimable déplace le focus sur le premier
    // item dont le texte commence par la chaîne accumulée. `Espace` n'arrive
    // jamais jusqu'ici — il active, au-dessus.
    if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
      runTypeahead(event.key);
    }
  };

  const handleBlur = (event: ReactFocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    // `relatedTarget` nul, c'est un focus qui ne va nulle part : la fenêtre
    // perd la main, ou Safari dé-focalise à l'appui sur un bouton — auquel cas
    // fermer ici rendrait la sélection à la souris impossible sur ce
    // navigateur. Les vrais clics extérieurs sont déjà couverts par le
    // `pointerdown` du conteneur.
    if (!next) return;
    if (contentRef.current?.contains(next)) return;
    if (triggerRef.current?.contains(next)) return;
    closeMenu(false);
  };

  return (
    <div
      ref={contentRef}
      id={contentId}
      role="menu"
      aria-labelledby={triggerId}
      data-slot="player-menu-content"
      // En amont c'est la primitive qui pose cet attribut ; ici le popup
      // n'existe qu'ouvert, donc il est toujours là. Il n'est pas décoratif :
      // c'est lui qui déclenche l'animation d'entrée.
      data-open=""
      className={cn(
        POPUP_CLASSNAME,
        // Vers le haut et aligné à droite : seule direction possible pour une
        // barre en bas. La hauteur est bornée à 16 rem, ou à la place qui reste
        // au-dessus du déclencheur si elle est moindre (variable posée par
        // l'effet de mise en page ci-dessus) : le conteneur du lecteur est
        // `overflow-hidden`, un popup plus haut que la vidéo serait coupé.
        //
        // `w-max` n'est pas une coquetterie. Un élément `absolute` sans `left`
        // se dimensionne en « shrink-to-fit », borné par la largeur disponible
        // dans son bloc conteneur — ici le cadre du menu, large comme son seul
        // bouton. Sans lui, le popup s'effondre donc sur son **min-content**,
        // c'est-à-dire sur le mot le plus long de sa liste : « Big Buck Bunny
        // wakes up » s'écrivait sur cinq lignes. Les menus de vitesse et de
        // qualité ne le montraient pas, leurs libellés étant si courts que le
        // `min-w-32` couvrait le défaut. `max-w-64` prend alors le relais du
        // repli, pour qu'un titre à rallonge ne pousse pas le popup hors de la
        // vidéo — le pendant horizontal de la borne de hauteur.
        "absolute right-0 bottom-full mb-2 max-h-[min(16rem,var(--player-menu-max-h,16rem))] w-max max-w-64",
        className,
      )}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    >
      {children}
    </div>
  );
}

export interface PlayerMenuItemProps {
  /** Appelé au clic ; le menu reste ouvert, c'est à l'appelant de le fermer. */
  onSelect: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Un item simple, sans état coché : une ligne qui mène ailleurs, comme celles
 * du menu de réglages. Il ne ferme pas le menu — ouvrir un sous-niveau ne
 * quitte pas le popup.
 */
export function PlayerMenuItem({ onSelect, disabled, className, children }: PlayerMenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      data-slot="player-menu-item"
      data-disabled={disabled ? "" : undefined}
      disabled={disabled}
      tabIndex={-1}
      className={cn(ITEM_CLASSNAME, className)}
      onClick={onSelect}
    >
      {children}
    </button>
  );
}

export interface PlayerMenuRadioItemProps {
  checked: boolean;
  onSelect: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

export function PlayerMenuRadioItem({
  checked,
  onSelect,
  disabled,
  className,
  children,
}: PlayerMenuRadioItemProps) {
  const { closeMenu } = useMenu();

  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      data-slot="player-menu-item"
      // `data-disabled` porte le style repris de l'amont et sert de filtre à la
      // navigation ; `disabled` met réellement le bouton hors d'atteinte.
      data-disabled={disabled ? "" : undefined}
      disabled={disabled}
      // Le menu n'a qu'un point d'entrée au clavier, son déclencheur. À
      // l'intérieur, c'est le menu qui déplace le focus, pas la tabulation.
      tabIndex={-1}
      className={cn(ITEM_CLASSNAME, className)}
      onClick={() => {
        onSelect();
        // On ferme et on rend le focus : au clavier, l'utilisateur doit
        // retrouver le déclencheur, désormais à jour de son choix.
        closeMenu(true);
      }}
    >
      {children}
      {checked ? (
        <span className="pointer-events-none absolute right-2 flex items-center justify-center">
          <CheckIcon />
        </span>
      ) : null}
    </button>
  );
}
