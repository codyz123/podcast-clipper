import { useEffect, useCallback } from "react";

interface KeyboardShortcuts {
  onPlayPause?: () => void;
  onSeekBack?: () => void;
  onSeekForward?: () => void;
  onSetInPoint?: () => void;
  onSetOutPoint?: () => void;
  onNextClip?: () => void;
  onPrevClip?: () => void;
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcuts) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (event.key.toLowerCase()) {
        case " ":
          event.preventDefault();
          shortcuts.onPlayPause?.();
          break;
        case "k":
          event.preventDefault();
          shortcuts.onPlayPause?.();
          break;
        case "j":
          event.preventDefault();
          shortcuts.onSeekBack?.();
          break;
        case "l":
          event.preventDefault();
          shortcuts.onSeekForward?.();
          break;
        case "i":
          event.preventDefault();
          shortcuts.onSetInPoint?.();
          break;
        case "o":
          event.preventDefault();
          shortcuts.onSetOutPoint?.();
          break;
        case "arrowleft":
          if (event.shiftKey) {
            event.preventDefault();
            shortcuts.onPrevClip?.();
          }
          break;
        case "arrowright":
          if (event.shiftKey) {
            event.preventDefault();
            shortcuts.onNextClip?.();
          }
          break;
      }
    },
    [shortcuts]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
