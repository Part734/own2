"use client";

import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSave } from "@fortawesome/free-solid-svg-icons";

type DirtySection = {
  count: number;
  isSaving?: boolean;
  onSave?: () => void | Promise<void>;
  onUndo?: () => void;
};

type DashboardDirtyContextValue = {
  sections: Record<string, DirtySection>;
  total: number;
  registerSection: (key: string, section: DirtySection) => void;
  clearSection: (key: string) => void;
  clearAll: () => void;
};

const DashboardDirtyContext = createContext<DashboardDirtyContextValue | null>(null);

export function DashboardDirtyProvider({ children }: { children: React.ReactNode }) {
  const [sections, setSections] = useState<Record<string, DirtySection>>({});

  // The real save/undo closures live outside React state on purpose.
  // Consumers frequently pass inline or otherwise unstable function
  // identities; if those were part of the state we'd write on every
  // re-render (state change → context change → re-render → new identity
  // → state change …) and hit "Maximum update depth exceeded".
  // Instead each section registers a stable trampoline that always
  // calls the newest closure, so only count/isSaving changes can write.
  const callbacksRef = useRef<Record<string, Pick<DirtySection, "onSave" | "onUndo">>>({});
  const trampolinesRef = useRef<Record<string, Pick<DirtySection, "onSave" | "onUndo">>>({});

  const registerSection = useCallback((key: string, section: DirtySection) => {
    if (!trampolinesRef.current[key]) {
      trampolinesRef.current[key] = {
        onSave: () => callbacksRef.current[key]?.onSave?.(),
        onUndo: () => callbacksRef.current[key]?.onUndo?.(),
      };
    }

    const trampoline = trampolinesRef.current[key]!;

    // Only store real callbacks. Sections read back out of context carry
    // our own trampolines — writing those back would make the trampoline
    // call itself forever.
    if (section.onSave !== trampoline.onSave) {
      callbacksRef.current[key] = {
        ...callbacksRef.current[key],
        onSave: section.onSave,
      };
    }
    if (section.onUndo !== trampoline.onUndo) {
      callbacksRef.current[key] = {
        ...callbacksRef.current[key],
        onUndo: section.onUndo,
      };
    }

    const next: DirtySection = {
      count: Math.max(0, Number(section.count) || 0),
      isSaving: Boolean(section.isSaving),
      onSave: trampoline.onSave,
      onUndo: trampoline.onUndo,
    };

    setSections((current) => {
      const existing = current[key];
      if (
        existing &&
        existing.count === next.count &&
        existing.isSaving === next.isSaving &&
        existing.onSave === next.onSave &&
        existing.onUndo === next.onUndo
      ) {
        return current;
      }

      return {
        ...current,
        [key]: next,
      };
    });
  }, []);

  const clearSection = useCallback((key: string) => {
    delete callbacksRef.current[key];
    delete trampolinesRef.current[key];

    setSections((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    callbacksRef.current = {};
    trampolinesRef.current = {};
    setSections({});
  }, []);

  const value = useMemo<DashboardDirtyContextValue>(() => {
    const total = Object.values(sections).reduce((sum, section) => sum + (section.count ?? 0), 0);

    return {
      sections,
      total,
      registerSection,
      clearSection,
      clearAll,
    };
  }, [clearAll, clearSection, registerSection, sections]);

  return (
    <DashboardDirtyContext.Provider value={value}>{children}</DashboardDirtyContext.Provider>
  );
}

export function useDashboardDirtyState(sectionKey?: string, section?: DirtySection) {
  const context = useContext(DashboardDirtyContext);
  const normalizedSection = useMemo(
    () => ({
      count: Math.max(0, Number(section?.count) || 0),
      isSaving: Boolean(section?.isSaving),
      onSave: section?.onSave,
      onUndo: section?.onUndo,
    }),
    [section?.count, section?.isSaving, section?.onSave, section?.onUndo]
  );

  useEffect(() => {
    if (!context || !sectionKey) return;
    context.registerSection(sectionKey, normalizedSection);
  }, [sectionKey, normalizedSection.count, normalizedSection.onSave, normalizedSection.onUndo]);

  return context ?? {
    sections: {},
    total: 0,
    registerSection: () => {},
    clearSection: () => {},
    clearAll: () => {},
  };
}

export function DashboardDirtyBanner() {
  const context = useDashboardDirtyState();
  const [mounted, setMounted] = useState(context.total > 0);
  const [closing, setClosing] = useState(false);

  // Adjust the animation state during render when the total changes
  // (React's recommended alternative to syncing state inside an effect).
  const [prevTotal, setPrevTotal] = useState(context.total);

  if (prevTotal !== context.total) {
    setPrevTotal(context.total);

    if (context.total > 0) {
      setClosing(false);
      setMounted(true);
    } else {
      setClosing(true);
    }
  }

  useEffect(() => {
    if (context.total > 0 || !closing) return;

    const timeout = window.setTimeout(() => setMounted(false), 180);
    return () => window.clearTimeout(timeout);
  }, [context.total, closing]);

  if (!mounted) return null;

  const saveAll = async () => {
    const entries = Object.entries(context.sections);

    entries.forEach(([key, section]) => {
      context.registerSection(key, {
        ...section,
        isSaving: true,
      });
    });

    await Promise.all(
      entries.map(async ([key, section]) => {
        try {
          await section.onSave?.();
        } finally {
          context.registerSection(key, {
            count: 0,
            isSaving: false,
            onSave: section.onSave,
            onUndo: section.onUndo,
          });
        }
      })
    );
  };

  const undoAll = () => {
    Object.values(context.sections).forEach((section) => section.onUndo?.());
  };

  const isSaving = Object.values(context.sections).some((section) => section.isSaving);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] z-[100] flex justify-center px-3 md:bottom-4"
    >
      <div
        className="pointer-events-auto w-full max-w-[760px] rounded-xl border border-[#2a2a2a] bg-[#0d0d0d]/95 p-3 shadow-[0_12px_48px_rgba(0,0,0,0.55),0_8px_40px_rgba(219,39,119,0.18)] backdrop-blur-md sm:p-4"
        style={{
          animation: closing
            ? "unsaved-out 220ms ease-in forwards"
            : "unsaved-in 260ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
        }}
      >
        <style>{`
          @keyframes unsaved-in {
            0% { opacity: 0; transform: scale(0.94) translateY(12px); }
            60% { opacity: 1; transform: scale(1.02) translateY(-2px); }
            100% { opacity: 1; transform: scale(1) translateY(0); }
          }
          @keyframes unsaved-out {
            0% { opacity: 1; transform: scale(1) translateY(0); }
            100% { opacity: 0; transform: scale(0.96) translateY(10px); }
          }
        `}</style>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0 px-0.5">
            <p className="text-sm font-semibold text-white">
              {isSaving
                ? "Saving changes..."
                : `You have ${context.total} unsaved change${context.total === 1 ? "" : "s"}.`}
            </p>
            <p className="mt-0.5 text-xs text-white/50 sm:text-sm">
              {isSaving
                ? "Please wait while your edits finish saving."
                : "Save to update your public page, or undo."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:w-auto sm:shrink-0 sm:items-center">
            <button
              type="button"
              onClick={undoAll}
              disabled={isSaving}
              className="inline-flex h-11 items-center justify-center rounded-lg border border-white/10 bg-white/5 px-3 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-50 sm:h-10 sm:min-w-[88px]"
            >
              Undo
            </button>

            <button
              type="button"
              onClick={saveAll}
              disabled={isSaving}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-pink-500/60 bg-pink-600 px-3 text-sm font-semibold text-white transition hover:bg-pink-500 disabled:pointer-events-none disabled:opacity-50 sm:h-10 sm:min-w-[140px]"
            >
              <FontAwesomeIcon icon={faSave} className="h-4 w-4" />
              {isSaving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
