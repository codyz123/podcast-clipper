const FONT_ALIASES: Record<string, string> = {
  arial: "Inter",
  "arial black": "Inter",
  impact: "Montserrat",
};

const AVAILABLE_FONTS = new Set(["inter", "montserrat"]);

const stripQuotes = (value: string) => value.replace(/^['"]|['"]$/g, "");

const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export const resolveFontFamily = (fontFamily?: string): string => {
  if (!fontFamily) return "Inter";

  const parts = fontFamily
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return "Inter";

  const primary = stripQuotes(parts[0]).toLowerCase();
  const mapped = FONT_ALIASES[primary];
  const resolvedPrimary = mapped || primary;

  if (AVAILABLE_FONTS.has(resolvedPrimary)) {
    const fallback = parts.slice(1);
    return [titleCase(resolvedPrimary), ...fallback].join(", ");
  }

  console.warn(`Font "${fontFamily}" not available, falling back to Inter`);
  return "Inter";
};
