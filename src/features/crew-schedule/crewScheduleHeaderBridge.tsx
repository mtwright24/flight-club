import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type CrewScheduleHeaderBridgeValue = {
  subtitle: string | null;
  setCrewScheduleHeaderSubtitle: (s: string | null) => void;
};

const CrewScheduleHeaderBridgeContext =
  createContext<CrewScheduleHeaderBridgeValue | null>(null);

export function CrewScheduleHeaderBridgeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [subtitle, setSubtitle] = useState<string | null>(null);

  const setCrewScheduleHeaderSubtitle = useCallback((s: string | null) => {
    setSubtitle(s);
  }, []);

  const value = useMemo(
    () => ({ subtitle, setCrewScheduleHeaderSubtitle }),
    [subtitle, setCrewScheduleHeaderSubtitle],
  );

  return (
    <CrewScheduleHeaderBridgeContext.Provider value={value}>
      {children}
    </CrewScheduleHeaderBridgeContext.Provider>
  );
}

/** Safe on non-schedule routes: no-op setter when provider missing. */
export function useCrewScheduleHeaderBridge(): CrewScheduleHeaderBridgeValue {
  const ctx = useContext(CrewScheduleHeaderBridgeContext);
  return (
    ctx ?? {
      subtitle: null,
      setCrewScheduleHeaderSubtitle: () => {},
    }
  );
}
