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
  /**
   * Incremented when hub data should reload across Schedule / Tradeboard / Open Time
   * (pull refresh, FLICA session, or successful schedule import). Tabs listen via hooks.
   */
  crewHubSharedRefreshGeneration: number;
  bumpCrewHubSharedDataRefresh: () => void;
};

const CrewScheduleHeaderBridgeContext =
  createContext<CrewScheduleHeaderBridgeValue | null>(null);

export function CrewScheduleHeaderBridgeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [subtitle, setSubtitle] = useState<string | null>(null);
  const [crewHubSharedRefreshGeneration, setCrewHubSharedRefreshGeneration] = useState(0);

  const setCrewScheduleHeaderSubtitle = useCallback((s: string | null) => {
    setSubtitle(s);
  }, []);

  const bumpCrewHubSharedDataRefresh = useCallback(() => {
    setCrewHubSharedRefreshGeneration((g) => g + 1);
  }, []);

  const value = useMemo(
    () => ({
      subtitle,
      setCrewScheduleHeaderSubtitle,
      crewHubSharedRefreshGeneration,
      bumpCrewHubSharedDataRefresh,
    }),
    [subtitle, setCrewScheduleHeaderSubtitle, crewHubSharedRefreshGeneration, bumpCrewHubSharedDataRefresh],
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
      crewHubSharedRefreshGeneration: 0,
      bumpCrewHubSharedDataRefresh: () => {},
    }
  );
}
