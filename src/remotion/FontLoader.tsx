import { useEffect } from "react";
import { continueRender, delayRender } from "remotion";

const FONT_FAMILIES = ["Montserrat", "Inter"];
const FONT_WEIGHTS = [400, 500, 600, 700, 800];

export const FontLoader: React.FC = () => {
  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts?.load) {
      return;
    }

    const handle = delayRender("Load caption fonts");
    const loads: Promise<unknown>[] = [];

    for (const family of FONT_FAMILIES) {
      for (const weight of FONT_WEIGHTS) {
        loads.push(document.fonts.load(`${weight} 16px ${family}`));
      }
    }

    Promise.all(loads)
      .catch(() => undefined)
      .finally(() => continueRender(handle));
  }, []);

  return null;
};
