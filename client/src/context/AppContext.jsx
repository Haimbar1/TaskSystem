import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api.js';

const AppContext = createContext(null);

export function AppProvider({ user, children }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const bumpRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  // The business's own task statuses, in board order (server/src/services/taskStatuses.js).
  const [statuses, setStatuses] = useState([]);

  useEffect(() => {
    api.getTaskStatuses().then((r) => setStatuses(r.statuses)).catch(console.error);
  }, []);

  const statusLabel = useCallback(
    (key) => statuses.find((s) => s.key === key)?.label || key,
    [statuses]
  );

  return (
    <AppContext.Provider value={{ user, refreshKey, bumpRefresh, statuses, setStatuses, statusLabel }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  return useContext(AppContext);
}
