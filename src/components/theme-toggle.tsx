"use client";

import { Check, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ACCENT_COLORS,
  BASE_THEMES,
  useAccentColor,
} from "@/context/color-theme-context";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { accentColor, setAccentColor } = useAccentColor();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="h-9 w-9">
        <Sun className="h-4 w-4" />
      </Button>
    );
  }

  const currentTheme = BASE_THEMES.find((t) => t.value === theme);
  const isDark = currentTheme?.isDark ?? false;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9">
          {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {/* Base Theme Section */}
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Theme
        </DropdownMenuLabel>

        {/* Light Themes */}
        <div className="grid grid-cols-2 gap-1 p-1">
          {BASE_THEMES.filter((t) => !t.isDark).map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTheme(t.value)}
              className={cn(
                "flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-colors",
                theme === t.value
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted",
              )}
            >
              <div
                className="h-4 w-4 rounded-full border border-border/50"
                style={{ backgroundColor: t.preview }}
              />
              {t.label}
              {theme === t.value && <Check className="h-3 w-3 ml-auto" />}
            </button>
          ))}
        </div>

        {/* Dark Themes */}
        <div className="grid grid-cols-2 gap-1 p-1">
          {BASE_THEMES.filter((t) => t.isDark).map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTheme(t.value)}
              className={cn(
                "flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-colors",
                theme === t.value
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted",
              )}
            >
              <div
                className="h-4 w-4 rounded-full border border-border/50"
                style={{ backgroundColor: t.preview }}
              />
              {t.label}
              {theme === t.value && <Check className="h-3 w-3 ml-auto" />}
            </button>
          ))}
        </div>

        <DropdownMenuSeparator />

        {/* Accent Color Section */}
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Accent Color
        </DropdownMenuLabel>
        <div className="grid grid-cols-7 gap-1 p-2">
          {ACCENT_COLORS.map((color) => (
            <button
              key={color.value}
              type="button"
              onClick={() => setAccentColor(color.value)}
              className={cn(
                "h-6 w-6 rounded-full border-2 transition-all hover:scale-110",
                accentColor === color.value
                  ? "border-foreground ring-2 ring-foreground ring-offset-1 ring-offset-background"
                  : "border-transparent",
              )}
              style={{ backgroundColor: color.color }}
              title={color.label}
            />
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
