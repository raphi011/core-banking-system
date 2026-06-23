"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";

import type { HintKey } from "./hint-content";
import { validateConceptContent } from "./concept-links";

const STORAGE_KEY = "concept-panel-collapsed";

interface ConceptPanelContextValue {
  defaultConcept: HintKey | null;
  setDefaultConcept: (key: HintKey | null) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  openConcept: (key: HintKey) => void;
  closeConcept: () => void;
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
  const [collapsed, setCollapsedState] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Hydrate collapse preference after mount to avoid an SSR/client mismatch.
  useEffect(() => {
    setCollapsedState(localStorage.getItem(STORAGE_KEY) === "true");
  }, []);

  // Fail loudly in dev if any concept body links to an unknown key.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") validateConceptContent();
  }, []);

  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  }, []);

  // Read live params from the URL in the handler (not during render) so we
  // preserve any other query params and avoid a Suspense boundary on the app.
  const openConcept = useCallback(
    (key: HintKey) => {
      const params = new URLSearchParams(window.location.search);
      params.set("concept", key);
      router.push(`${pathname}?${params.toString()}`);
      setMobileOpen(true);
    },
    [router, pathname],
  );

  const closeConcept = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    params.delete("concept");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
    setMobileOpen(false);
  }, [router, pathname]);

  const togglePanel = useCallback(() => {
    setCollapsed(false);
    setMobileOpen(true);
  }, [setCollapsed]);

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
        closeConcept,
        togglePanel,
      }}
    >
      {children}
    </ConceptPanelContext.Provider>
  );
}
