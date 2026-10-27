import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Dice5 as Dices } from "@mynaui/icons-react";
import { useMemo, useState } from "react";
import {
  avatarCatalog,
  avatarTraitLabel,
  countAvatarCombinations,
  createAvatar,
  createAvatarSeed,
  UkiyoAvatar,
  type AvatarDefinition,
  type AvatarTrait,
} from "@dojofoo/avatar";
import { BrandLogo } from "@dojofoo/uix/components/brand-logo";
import { Button } from "@dojofoo/uix/components/button";
import { AppShell, Icon, MenuButton } from "@dojofoo/uix/components/app-shell";
import { CoursesIcon, ExploreIcon, MoonIcon, SunIcon } from "@dojofoo/uix/icons";
import { setPageMode, usePageMode } from "@dojofoo/uix/lib/ui-preferences";
import { useAccountMenu } from "@/hooks/use-account-menu";

export const Route = createFileRoute("/avatar")({ component: AvatarStudio });

const traitNames: Record<AvatarTrait, string> = {
  head: "Head shape",
  palette: "Complexion",
  eyes: "Eyes",
  brows: "Brows",
  nose: "Nose",
  mouth: "Mouth",
  hair: "Hair",
  accessory: "Accessory",
};

function AvatarStudio() {
  const navigate = Route.useNavigate();
  const { account, toast } = useAccountMenu();
  const mode = usePageMode();
  const [seed, setSeed] = useState("ukiyo-dojofoo");
  const [avatar, setAvatar] = useState(() => createAvatar(seed));
  const variations = useMemo(() => Array.from({ length: 6 }, (_, index) => {
    const variantSeed = `${seed}:variation:${index}`;
    return { seed: variantSeed, avatar: createAvatar(variantSeed) };
  }), [seed]);

  function randomize() {
    const nextSeed = createAvatarSeed();
    setSeed(nextSeed);
    setAvatar(createAvatar(nextSeed));
  }

  function selectTrait<K extends AvatarTrait>(trait: K, value: AvatarDefinition[K]) {
    setAvatar((current) => ({ ...current, [trait]: value }));
  }

  return (
    <div className="h-dvh overflow-hidden"><AppShell {...account} workspace="Dojo" sidebarWidth="18rem" showNews={false} showOnboarding={false}
      brand={<Link aria-label="Dojo dashboard" className="flex items-center" to="/"><BrandLogo className="aspect-[2567/1211] h-6 w-auto" /></Link>}
      navigation={[{ id: "main", items: [{ id: "courses", label: "Courses", icon: CoursesIcon, href: "/" },
        { id: "explore", label: "Explore", icon: ExploreIcon, href: "/explore" }] }]}
      onNavigate={id => { void navigate({ to: id === "explore" ? "/explore" : "/" }); }}>
      <div className="px-6 pt-5 md:px-10 flex items-center justify-between gap-4">
        <Link className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" to="/"><ArrowLeft size={15} /> Courses</Link>
        <Button size="sm" variant="ghost" aria-label={`Use ${mode === "dark" ? "light" : "dark"} theme`}
          icon={<Icon icon={mode === "dark" ? SunIcon : MoonIcon} size={16} />}
          onClick={() => { const next = mode === "dark" ? "light" : "dark"; setPageMode(next); window.localStorage.setItem("dojofoo.theme", next); }} />
      </div>
      <section className="mx-auto grid w-full max-w-7xl lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col">
          <header className="flex flex-wrap items-end justify-between gap-5 px-6 py-6 md:px-10">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Ukiyo-e avatar studio</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">Character workshop</h1>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">{countAvatarCombinations().toLocaleString()} vector combinations from the current sprite catalog.</p>
            </div>
            <Button icon={<Dices size={16} />} onClick={randomize} variant="secondary">Randomize</Button>
          </header>
          <div className="grid flex-1 place-items-center overflow-hidden px-6 pb-6 md:px-10">
            <div className="aspect-square w-full max-w-xl overflow-hidden rounded-[var(--box-radius)] bg-[var(--surface-1)] shadow-[var(--shadow-2)]">
              <UkiyoAvatar avatar={avatar} className="h-full w-full" />
            </div>
          </div>
          <div className="px-6 pb-6 md:px-10">
            <p className="text-xs font-medium text-muted-foreground">Seeded variations</p>
            <div className="mt-3 grid grid-cols-6 gap-2">
              {variations.map((variation) => (
                <button
                  aria-label={`Use variation ${variation.seed}`}
                  className="aspect-square min-w-0 overflow-hidden rounded-[var(--box-radius)] bg-[var(--surface-3)] shadow-[var(--shadow-1)] transition-colors hover:bg-[var(--fluid-hover)] focus-visible:outline-2 focus-visible:outline-[var(--brand)]"
                  key={variation.seed}
                  onClick={() => { setSeed(variation.seed); setAvatar(variation.avatar); }}
                  type="button"
                >
                  <UkiyoAvatar avatar={variation.avatar} className="h-full w-full" />
                </button>
              ))}
            </div>
          </div>
        </div>
        <aside aria-label="Character traits" className="min-w-0 p-6 md:p-8">
          <p className="text-xs font-medium text-muted-foreground">Build character</p>
          <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{seed}</p>
          <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
            {(Object.keys(avatarCatalog) as AvatarTrait[]).map((trait) => (
              <div className="grid min-w-0 gap-2" key={trait}>
                <span className="text-xs font-medium text-muted-foreground">{traitNames[trait]}</span>
                <MenuButton label={traitNames[trait]} value={avatar[trait]} align="start" className="w-full justify-between"
                  onChange={value => selectTrait(trait, value as AvatarDefinition[typeof trait])}
                  options={avatarCatalog[trait].map(value => ({ value, label: avatarTraitLabel(trait, value) }))} />
              </div>
            ))}
          </div>
        </aside>
      </section>
      {toast}
    </AppShell></div>
  );
}
