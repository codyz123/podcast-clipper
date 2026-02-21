import { useEffect } from "react";
import { continueRender, delayRender } from "remotion";

const FONT_FAMILIES = ["Montserrat", "Inter"];
const FONT_WEIGHTS = [400, 500, 600, 700, 800];
const FONT_TIMEOUT = 10000; // 10 second timeout

export const FontLoader: React.FC = () => {
  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts?.load) {
      return;
    }

    const handle = delayRender("Load caption fonts");
    
    // Create font loading promises with individual error handling
    const fontPromises = FONT_FAMILIES.flatMap(family =>
      FONT_WEIGHTS.map(weight => {
        const fontSpec = `${weight} 16px ${family}`;
        return document.fonts.load(fontSpec).catch((error) => {
          console.warn(`Failed to load font: ${fontSpec}`, error);
          // Return null for failed loads instead of rejecting
          return null;
        });
      })
    );

    // Add timeout to prevent hanging
    const timeoutPromise = new Promise(resolve => {
      setTimeout(() => {
        console.warn('Font loading timeout reached, continuing render');
        resolve(null);
      }, FONT_TIMEOUT);
    });

    // Race between font loading and timeout
    Promise.race([
      Promise.all(fontPromises),
      timeoutPromise
    ]).finally(() => {
      try {
        continueRender(handle);
      } catch (error) {
        console.error('Error continuing render after font load:', error);
      }
    });

    // Preload fonts in DOM for fallback
    const preloadElements = FONT_FAMILIES.flatMap(family =>
      FONT_WEIGHTS.map(weight => {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'font';
        link.type = 'font/woff2';
        link.crossOrigin = 'anonymous';
        link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/\s+/g, '+')}:wght@${weight}&display=swap`;
        document.head.appendChild(link);
        return link;
      })
    );

    // Cleanup function
    return () => {
      preloadElements.forEach(link => {
        try {
          document.head.removeChild(link);
        } catch (error) {
          // Element might already be removed
        }
      });
    };
  }, []);

  return (
    <>
      {/* Invisible text to force font rendering */}
      <div style={{ 
        position: 'absolute', 
        visibility: 'hidden', 
        pointerEvents: 'none',
        fontSize: 1,
        fontFamily: FONT_FAMILIES.join(', ') + ', system-ui, sans-serif'
      }}>
        {FONT_WEIGHTS.map(weight => (
          <span key={weight} style={{ fontWeight: weight }}>Font Test</span>
        ))}
      </div>
    </>
  );
};
