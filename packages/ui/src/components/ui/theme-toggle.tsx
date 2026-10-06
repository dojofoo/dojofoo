"use client";

import { Moon, Sun } from "@mynaui/icons-react";
import { useEffect, useState } from "react";

const STORAGE_KEY = "dojofoo.theme";

type Theme = "dark" | "light";

function currentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(currentTheme());
  }, []);

  function toggle() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    window.localStorage.setItem(STORAGE_KEY, next);
    setTheme(next);
  }

  const nextTheme = theme === "light" ? "dark" : "light";

  return (
    <button
      aria-label={`Use ${nextTheme} theme`}
      className="flex size-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
      onClick={toggle}
      title={`Use ${nextTheme} theme`}
      type="button"
    >
      {theme === "light" ? <Moon aria-hidden size={15} /> : <Sun aria-hidden size={15} />}
    </button>
  );
}
