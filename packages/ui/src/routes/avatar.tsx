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
import { BrandLogo } from "@dojofoo/ui/brand-logo";
import { Button } from "@dojofoo/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@dojofoo/ui/select";
import { SiteNavigation } from "@dojofoo/ui/site-navigation";
import { ThemeToggle } from "@dojofoo/ui/theme-toggle";

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
    <main className="min-h-screen bg-background text-foreground">
      <SiteNavigation
        brand={<Link aria-label="Dojofoo courses" className="flex items-center" to="/"><BrandLogo /></Link>}
        actions={<><Link className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground" to="/"><ArrowLeft size={15} /> Courses</Link><ThemeToggle /></>}
      />
      <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl lg:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="flex min-w-0 flex-col border-b border-border bg-surface-1 lg:border-r lg:border-b-0">
          <header className="flex flex-wrap items-end justify-between gap-5 border-b border-border px-6 py-6 md:px-10">
            <div>
              <p className="font-display text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Ukiyo-e avatar studio</p>
              <h1 className="mt-2 font-display text-3xl font-semibold">Character workshop</h1>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">{countAvatarCombinations().toLocaleString()} vector combinations from the current sprite catalog.</p>
            </div>
            <Button leadingIcon={Dices} onClick={randomize} variant="secondary">Randomize</Button>
          </header>
          <div className="grid flex-1 place-items-center overflow-hidden p-6 md:p-10">
            <div className="aspect-square w-full max-w-xl border border-border bg-[#f3eee7] dark:bg-[#d8d0c5]">
              <UkiyoAvatar avatar={avatar} className="h-full w-full" />
            </div>
          </div>
          <div className="border-t border-border px-6 py-5 md:px-10">
            <p className="font-display text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Seeded variations</p>
            <div className="mt-3 grid grid-cols-6 gap-2">
              {variations.map((variation) => (
                <button
                  aria-label={`Use variation ${variation.seed}`}
                  className="aspect-square min-w-0 border border-border bg-[#f3eee7] transition-colors hover:border-primary"
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
        <aside className="bg-background p-6 md:p-8">
          <p className="font-display text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Build character</p>
          <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{seed}</p>
          <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
            {(Object.keys(avatarCatalog) as AvatarTrait[]).map((trait) => (
              <label className="grid gap-2" key={trait}>
                <span className="font-display text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{traitNames[trait]}</span>
                <Select onValueChange={(value) => selectTrait(trait, value as AvatarDefinition[typeof trait])} value={avatar[trait]}>
                  <SelectTrigger className="w-full" />
                  <SelectContent>
                    {avatarCatalog[trait].map((option, index) => (
                      <SelectItem index={index} key={option} value={option}>{avatarTraitLabel(trait, option)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}
