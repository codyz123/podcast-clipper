import { useState, useRef, useEffect, useCallback } from "react";

export interface UseDropdownOptions {
  /** Close dropdown when Escape is pressed. Default: true */
  closeOnEscape?: boolean;
  /** Close dropdown when focus moves outside container. Default: true */
  closeOnTabOut?: boolean;
  /** Initial open state. Default: false */
  initialOpen?: boolean;
}

export interface UseDropdownReturn {
  /** Whether the dropdown is currently open */
  isOpen: boolean;
  /** Set the open state directly */
  setIsOpen: (open: boolean) => void;
  /** Toggle the dropdown open/closed */
  toggle: () => void;
  /** Close the dropdown (also restores focus to trigger) */
  close: () => void;
  /** Ref to attach to the container element (wraps both trigger and menu) */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Ref to attach to the trigger button (for focus restoration) */
  triggerRef: React.RefObject<HTMLElement | null>;
  /** Props to spread on the trigger button */
  triggerProps: {
    onClick: () => void;
    "aria-expanded": boolean;
    "aria-haspopup": "menu";
  };
  /** Props to spread on the menu container */
  menuProps: {
    role: "menu";
  };
  /** Get props for a menu item by index */
  getItemProps: (index: number) => {
    role: "menuitem";
    tabIndex: number;
  };
}

/**
 * Hook for managing dropdown state with consistent behavior:
 * - Click-outside detection
 * - Escape key handling
 * - Tab-out detection
 * - Focus restoration
 * - ARIA attributes
 */
export function useDropdown(options: UseDropdownOptions = {}): UseDropdownReturn {
  const { closeOnEscape = true, closeOnTabOut = true, initialOpen = false } = options;

  const [isOpen, setIsOpen] = useState(initialOpen);
  const containerRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLElement>(null);

  // Use refs for handlers to avoid stale closures
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  const close = useCallback(() => {
    setIsOpen(false);
    // Restore focus to trigger after closing
    triggerRef.current?.focus();
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  // Click-outside detection
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!isOpenRef.current) return;
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [close]);

  // Escape key handling
  useEffect(() => {
    if (!closeOnEscape) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpenRef.current) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeOnEscape, close]);

  // Tab-out detection (close when focus leaves container)
  useEffect(() => {
    if (!closeOnTabOut) return;

    const handleFocusOut = (e: FocusEvent) => {
      if (!isOpenRef.current) return;
      // Check if the new focus target is outside the container
      const relatedTarget = e.relatedTarget as Node | null;
      if (containerRef.current && relatedTarget && !containerRef.current.contains(relatedTarget)) {
        close();
      }
    };

    const container = containerRef.current;
    container?.addEventListener("focusout", handleFocusOut);
    return () => container?.removeEventListener("focusout", handleFocusOut);
  }, [closeOnTabOut, close]);

  const triggerProps = {
    onClick: toggle,
    "aria-expanded": isOpen,
    "aria-haspopup": "menu" as const,
  };

  const menuProps = {
    role: "menu" as const,
  };

  const getItemProps = (index: number) => ({
    role: "menuitem" as const,
    tabIndex: index === 0 ? 0 : -1,
  });

  return {
    isOpen,
    setIsOpen,
    toggle,
    close,
    containerRef,
    triggerRef,
    triggerProps,
    menuProps,
    getItemProps,
  };
}
