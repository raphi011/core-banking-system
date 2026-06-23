"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { usePathname, useRouter } from "next/navigation";

import type { HintKey } from "./hint-content";
import { validateConceptContent } from "./concept-links";

const STORAGE_KEY = "concept-panel-collapsed";
const COLLAPSE_EVENT = "concept-panel-collapsed-change";
const DESKTOP_QUERY = "(min-width: 768px)";

// Collapse preference is an external store (localStorage). Reading it via
// useSyncExternalStore keeps hydration safe and avoids a synchronous setState
// inside an effect.
function subscribeCollapsed(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(COLLAPSE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(COLLAPSE_EVENT, callback);
  };
}

function getCollapsedSnapshot(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "true";
}

function getCollapsedServerSnapshot(): boolean {
  return false;
}

interface ConceptPanelContextValue {
  defaultConcept: HintKey | null;
  setDefaultConcept: (key: HintKey | null) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  openConcept: (key: HintKey) => void;
  togglePanel: () => void;
}

const ConceptPanelContext = createContext<ConceptPanelContextValue | null>(null);

export function useConceptPanel(): ConceptPanelContextValue {
  const ctx = useContext(ConceptPanelContext);
  if (!ctx) {
    throw new Error("useConceptPanel must be used within ConceptPanelProvider");
  }
  return ctx;
}

export function ConceptPanelProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [defaultConcept, setDefaultConcept] = useState<HintKey | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const collapsed = useSyncExternalStore(
    subscribeCollapsed,
    getCollapsedSnapshot,
    getCollapsedServerSnapshot,
  );

  // Fail loudly in dev if any concept body links to an unknown key.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") validateConceptContent();
  }, []);

  const setCollapsed = useCallback((next: boolean) => {
    localStorage.setItem(STORAGE_KEY, String(next));
    window.dispatchEvent(new Event(COLLAPSE_EVENT));
  }, []);

  // Reveal the panel on whichever surface this viewport uses: expand the desktop
  // rail, or open the mobile sheet. Decided at call time (not render) so it never
  // opens the mobile sheet's full-screen overlay on desktop.
  const revealPanel = useCallback(() => {
    if (window.matchMedia(DESKTOP_QUERY).matches) {
      setCollapsed(false);
    } else {
      setMobileOpen(true);
    }
  }, [setCollapsed]);

  // Read live params from the URL in the handler (not during render) so we
  // preserve any other query params and avoid a Suspense boundary on the app.
  const openConcept = useCallback(
    (key: HintKey) => {
      const params = new URLSearchParams(window.location.search);
      params.set("concept", key);
      router.push(`${pathname}?${params.toString()}`);
      revealPanel();
    },
    [router, pathname, revealPanel],
  );

  const togglePanel = useCallback(() => {
    revealPanel();
  }, [revealPanel]);

  return (
    <ConceptPanelContext.Provider
      value={{
        defaultConcept,
        setDefaultConcept,
        collapsed,
        setCollapsed,
        mobileOpen,
        setMobileOpen,
        openConcept,
        togglePanel,
      }}
    >
      {children}
    </ConceptPanelContext.Provider>
  );
}
