/**
 * Extract dominant colors from an image for brand theming
 */

export interface BrandColors {
  primary: string; // Main accent color (replaces cyan)
  secondary: string; // Secondary accent (replaces magenta)
  primaryHsl: string; // HSL values for CSS variables
  secondaryHsl: string;
}

interface ColorCount {
  r: number;
  g: number;
  b: number;
  count: number;
}

/**
 * Convert RGB to HSL
 */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

/**
 * Calculate color distance for clustering
 */
function colorDistance(c1: ColorCount, c2: ColorCount): number {
  return Math.sqrt(Math.pow(c1.r - c2.r, 2) + Math.pow(c1.g - c2.g, 2) + Math.pow(c1.b - c2.b, 2));
}

/**
 * Check if a color is too dark, too light, or too desaturated
 */
function isViableAccentColor(r: number, g: number, b: number): boolean {
  const [, s, l] = rgbToHsl(r, g, b);

  // Reject colors that are:
  // - Too dark (l < 15) or too light (l > 85)
  // - Too desaturated (s < 15) - these are grays
  return s >= 15 && l >= 15 && l <= 85;
}

/**
 * Extract dominant colors from an image data URL
 */
export async function extractBrandColors(imageDataUrl: string): Promise<BrandColors | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        resolve(null);
        return;
      }

      // Sample at a smaller size for performance
      const sampleSize = 100;
      canvas.width = sampleSize;
      canvas.height = sampleSize;

      ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
      const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
      const pixels = imageData.data;

      // Collect colors with quantization (reduce color space)
      const viableColorMap = new Map<string, ColorCount>();
      const fallbackColorMap = new Map<string, ColorCount>();
      const quantize = 24; // Quantization factor

      for (let i = 0; i < pixels.length; i += 4) {
        const r = Math.round(pixels[i] / quantize) * quantize;
        const g = Math.round(pixels[i + 1] / quantize) * quantize;
        const b = Math.round(pixels[i + 2] / quantize) * quantize;
        const a = pixels[i + 3];

        // Skip transparent pixels
        if (a < 128) continue;

        const key = `${r},${g},${b}`;

        // Check if it's a viable accent color
        if (isViableAccentColor(r, g, b)) {
          const existing = viableColorMap.get(key);
          if (existing) {
            existing.count++;
          } else {
            viableColorMap.set(key, { r, g, b, count: 1 });
          }
        } else {
          // Also track non-viable colors as fallback
          const [, s] = rgbToHsl(r, g, b);
          // Only track colors with some saturation (not pure grays)
          if (s >= 5) {
            const existing = fallbackColorMap.get(key);
            if (existing) {
              existing.count++;
            } else {
              fallbackColorMap.set(key, { r, g, b, count: 1 });
            }
          }
        }
      }

      // Convert to arrays and sort by frequency
      let colors = Array.from(viableColorMap.values()).sort((a, b) => b.count - a.count);

      console.warn("[Brand Colors] Found", colors.length, "viable colors");

      // Fallback to less-ideal colors if no viable ones found
      if (colors.length === 0) {
        colors = Array.from(fallbackColorMap.values()).sort((a, b) => b.count - a.count);
        console.warn("[Brand Colors] Using fallback colors:", colors.length);
      }

      if (colors.length === 0) {
        console.warn("[Brand Colors] No colors found in image");
        resolve(null);
        return;
      }

      // Pick primary color (most common viable color)
      const primary = colors[0];
      const [primaryH, primaryS, primaryL] = rgbToHsl(primary.r, primary.g, primary.b);

      // Pick secondary color - find one that's visually distinct from primary
      let secondary = colors.length > 1 ? colors[1] : primary;

      for (const color of colors.slice(1)) {
        const distance = colorDistance(primary, color);
        // Look for a color that's at least somewhat different
        if (distance > 80) {
          secondary = color;
          break;
        }
      }

      const [secondaryH, secondaryS, secondaryL] = rgbToHsl(secondary.r, secondary.g, secondary.b);

      // If secondary is too similar to primary, create a complementary color
      let finalSecondaryH = secondaryH;
      let finalSecondaryS = secondaryS;
      let finalSecondaryL = secondaryL;

      if (colorDistance(primary, secondary) < 50) {
        // Create a complementary hue
        finalSecondaryH = (primaryH + 180) % 360;
        finalSecondaryS = Math.max(40, primaryS);
        finalSecondaryL = Math.min(60, Math.max(40, primaryL));
      }

      resolve({
        primary: `hsl(${primaryH}, ${primaryS}%, ${primaryL}%)`,
        secondary: `hsl(${finalSecondaryH}, ${finalSecondaryS}%, ${finalSecondaryL}%)`,
        primaryHsl: `${primaryH} ${primaryS}% ${primaryL}%`,
        secondaryHsl: `${finalSecondaryH} ${finalSecondaryS}% ${finalSecondaryL}%`,
      });
    };

    img.onerror = () => {
      resolve(null);
    };

    img.src = imageDataUrl;
  });
}

/**
 * Apply brand colors to CSS custom properties
 * Sets variables directly on root for highest specificity
 */

/**
 * Convert HSL string to hex color
 */
function hslToHex(hsl: string): string {
  // Parse "H S% L%" format
  const match = hsl.match(/(\d+)\s+(\d+)%?\s+(\d+)%?/);
  if (!match) return "#00d4ff"; // fallback to default cyan

  const h = parseInt(match[1], 10) / 360;
  const s = parseInt(match[2], 10) / 100;
  const l = parseInt(match[3], 10) / 100;

  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  const toHex = (x: number) => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Generate a darker shade of a hex color for gradient
 */
function darkenHex(hex: string, amount: number = 0.2): string {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.round((num >> 16) * (1 - amount)));
  const g = Math.max(0, Math.round(((num >> 8) & 0x00ff) * (1 - amount)));
  const b = Math.max(0, Math.round((num & 0x0000ff) * (1 - amount)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/**
 * Generate favicon SVG with brand colors
 */
function generateFaviconSvg(primaryHex: string): string {
  const darkerHex = darkenHex(primaryHex, 0.25);

  return `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="iconGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${primaryHex}"/>
      <stop offset="100%" style="stop-color:${darkerHex}"/>
    </linearGradient>
  </defs>
  <!-- Background circle -->
  <circle cx="16" cy="16" r="15" fill="url(#iconGradient)"/>
  <!-- Microphone body -->
  <rect x="12" y="6" width="8" height="12" rx="4" fill="#0a0a0f"/>
  <!-- Microphone stand -->
  <path d="M16 18V22" stroke="#0a0a0f" stroke-width="2" stroke-linecap="round"/>
  <path d="M12 22H20" stroke="#0a0a0f" stroke-width="2" stroke-linecap="round"/>
  <!-- Gear/automation indicator (small gear) -->
  <circle cx="23" cy="23" r="5" fill="#0a0a0f"/>
  <circle cx="23" cy="23" r="3" fill="none" stroke="${primaryHex}" stroke-width="1.5"/>
  <circle cx="23" cy="23" r="1" fill="${primaryHex}"/>
  <!-- Gear teeth -->
  <path d="M23 17.5V18.5M23 27.5V28.5M17.5 23H18.5M27.5 23H28.5" stroke="#0a0a0f" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;
}

/**
 * Update the favicon with brand colors
 */
function updateFavicon(primaryHsl: string | null): void {
  // Find or create the favicon link element
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');

  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/svg+xml";
    document.head.appendChild(link);
  }

  if (primaryHsl) {
    // Generate brand-colored favicon
    const hex = hslToHex(primaryHsl);
    const svg = generateFaviconSvg(hex);
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);

    // Revoke old blob URL if it exists
    if (link.href.startsWith("blob:")) {
      URL.revokeObjectURL(link.href);
    }

    link.href = url;
  } else {
    // Reset to default favicon
    if (link.href.startsWith("blob:")) {
      URL.revokeObjectURL(link.href);
    }
    link.href = "/podcastomatic.svg";
  }
}

/**
 * Create a very dark tinted background color from an HSL value
 * Takes the hue from the brand color and creates a nearly-black version
 */
function createTintedBackground(hsl: string): string {
  // Parse "H S% L%" format
  const match = hsl.match(/(\d+)\s+(\d+)%?\s+(\d+)%?/);
  if (!match) return "260 30% 4%"; // fallback to default

  const h = parseInt(match[1], 10);
  // Use the brand hue but with very low saturation and lightness
  // This creates a subtle tint that's still nearly black
  return `${h} 15% 5%`;
}

/**
 * Parse an hsl() color string to extract H S% L% values
 * Handles both "hsl(H, S%, L%)" and "H S% L%" formats
 */
export function parseHslToValues(hslString: string): string | null {
  if (!hslString) return null;

  // Try "hsl(H, S%, L%)" format
  const hslMatch = hslString.match(/hsl\((\d+),?\s*(\d+)%?,?\s*(\d+)%?\)/i);
  if (hslMatch) {
    return `${hslMatch[1]} ${hslMatch[2]}% ${hslMatch[3]}%`;
  }

  // Try "H S% L%" format (already in correct format)
  const valuesMatch = hslString.match(/^(\d+)\s+(\d+)%?\s+(\d+)%?$/);
  if (valuesMatch) {
    return `${valuesMatch[1]} ${valuesMatch[2]}% ${valuesMatch[3]}%`;
  }

  return null;
}

/**
 * Convert stored brand colors (from backend) to BrandColors format
 */
export function parseBrandColorsFromStorage(stored: {
  primary?: string;
  secondary?: string;
}): BrandColors | null {
  const primaryHsl = parseHslToValues(stored.primary || "");
  const secondaryHsl = parseHslToValues(stored.secondary || "");

  if (!primaryHsl) return null;

  return {
    primary: stored.primary || "",
    secondary: stored.secondary || "",
    primaryHsl,
    secondaryHsl: secondaryHsl || primaryHsl, // Fallback to primary if no secondary
  };
}

export function applyBrandColors(colors: BrandColors | null): void {
  const root = document.documentElement;

  if (colors) {
    console.warn("[Brand Colors] Applying:", colors);
    // Set brand color slots
    root.style.setProperty("--brand-primary", colors.primaryHsl);
    root.style.setProperty("--brand-secondary", colors.secondaryHsl);
    // Override accent colors directly (inline styles have highest specificity)
    root.style.setProperty("--cyan", colors.primaryHsl);
    root.style.setProperty("--cyan-glow", colors.primaryHsl);
    root.style.setProperty("--magenta", colors.secondaryHsl);
    root.style.setProperty("--magenta-glow", colors.secondaryHsl);
    root.style.setProperty("--primary", colors.primaryHsl);
    root.style.setProperty("--secondary", colors.secondaryHsl);

    // Apply subtle background tint based on primary brand color
    const tintedBg = createTintedBackground(colors.primaryHsl);
    root.style.setProperty("--bg-base", tintedBg);
    root.style.setProperty("--void", tintedBg);
    root.style.setProperty("--deep", `${tintedBg.split(" ")[0]} 12% 7%`);

    root.classList.add("has-brand-colors");

    // Update favicon with brand color
    updateFavicon(colors.primaryHsl);

    console.warn(
      "[Brand Colors] Applied variables to root:",
      colors.primaryHsl,
      colors.secondaryHsl,
      "bg:",
      tintedBg
    );
  } else {
    // Remove all overrides to restore defaults
    root.style.removeProperty("--brand-primary");
    root.style.removeProperty("--brand-secondary");
    root.style.removeProperty("--cyan");
    root.style.removeProperty("--cyan-glow");
    root.style.removeProperty("--magenta");
    root.style.removeProperty("--magenta-glow");
    root.style.removeProperty("--primary");
    root.style.removeProperty("--secondary");
    root.style.removeProperty("--bg-base");
    root.style.removeProperty("--void");
    root.style.removeProperty("--deep");
    root.classList.remove("has-brand-colors");

    // Reset favicon to default
    updateFavicon(null);

    console.warn("[Brand Colors] Cleared all overrides");
  }
}
