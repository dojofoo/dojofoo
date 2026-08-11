import { Button, buttonVariants } from "@dojocho/ui";
import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GithubIcon } from "@/components/github-icon";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { cn } from "@/lib/utils";
import { gitConfig } from "@/lib/layout.shared";

const githubUrl = `https://github.com/${gitConfig.user}/${gitConfig.repo}`;

interface MarketplaceNavigationProps {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
}

export function MarketplaceNavigation({
  searchValue = "",
  onSearchChange,
}: MarketplaceNavigationProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (!onSearchChange) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSearchChange]);

  return (
    <header className="sticky top-0 z-40 border-b border-dashed border-border bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-(--fd-layout-width) items-center gap-2 px-5 lg:px-8">
        <Link to="/" aria-label="Dojocho courses" className="mr-1 flex items-center">
          <img src="/logo.svg" alt="dojocho" className="h-5 w-auto" />
        </Link>
        {onSearchChange ? (
          <button
            type="button"
            aria-label="Search courses"
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((open) => !open)}
            className={cn(
              buttonVariants({ size: "icon", variant: "ghost" }),
              "relative overflow-visible text-muted-foreground",
            )}
          >
            <Search className="!size-5" />
            <kbd className="pointer-events-none absolute -right-1 -bottom-1 bg-foreground px-1 py-0.5 text-[9px] leading-none font-medium text-background shadow-sm">
              ⌘K
            </kbd>
          </button>
        ) : null}

        <nav aria-label="Primary" className="ml-auto flex items-center gap-1">
          <Link
            to="/$"
            params={{ _splat: "docs" }}
            className="px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-80 hover:text-foreground"
          >
            Docs
          </Link>
          <a
            href={githubUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
            className={cn(
              buttonVariants({ size: "icon", variant: "ghost" }),
              "text-muted-foreground",
            )}
          >
            <GithubIcon className="!size-5" />
          </a>
          <ThemeToggle />
          <Button asChild variant="cta" className="ml-1">
            <Link to="/$" params={{ _splat: "docs/installation" }}>Get Dojocho</Link>
          </Button>
        </nav>
      </div>

      {onSearchChange ? (
        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-200 ease-out",
            searchOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="overflow-hidden">
            <div className="mx-auto max-w-(--fd-layout-width) border-t border-dashed border-border px-5 py-3 lg:px-8">
              <label className="flex items-center gap-3 border-l-2 border-[#6B97FF] bg-surface-1 px-3 shadow-surface-2">
                <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <input
                  ref={searchRef}
                  type="search"
                  role="searchbox"
                  aria-label="Search courses"
                  placeholder="Search courses"
                  value={searchValue}
                  onChange={(event) => onSearchChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setSearchOpen(false);
                  }}
                  className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </label>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
