import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchSheet } from './sheets';
import type { SheetData, SheetName } from './sheets';

export interface SheetState {
  status: 'idle' | 'loading' | 'success' | 'error';
  data: SheetData | null;
  error: string | null;
  lastUpdated: string | null;
}

interface DataContextValue {
  sheets: Record<SheetName, SheetState>;
  loadSheet: (sheet: SheetName) => Promise<void>;
  refreshAll: () => Promise<void>;
}

const defaultState: SheetState = {
  status: 'idle',
  data: null,
  error: null,
  lastUpdated: null
};

const DataContext = createContext<DataContextValue | null>(null);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sheets, setSheets] = useState<Record<SheetName, SheetState>>({
    Деньги: { ...defaultState },
    Прибыль: { ...defaultState },
    Капитал: { ...defaultState }
  });

  const loadSheet = useCallback(async (sheet: SheetName) => {
    setSheets((prev) => ({
      ...prev,
      [sheet]: { ...prev[sheet], status: 'loading', error: null }
    }));

    try {
      const data = await fetchSheet(sheet);
      setSheets((prev) => ({
        ...prev,
        [sheet]: {
          status: 'success',
          data,
          error: null,
          lastUpdated: new Date().toISOString()
        }
      }));
    } catch (error) {
      setSheets((prev) => ({
        ...prev,
        [sheet]: {
          status: 'error',
          data: null,
          error: error instanceof Error ? error.message : 'Неизвестная ошибка',
          lastUpdated: null
        }
      }));
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      loadSheet('Деньги'),
      loadSheet('Прибыль'),
      loadSheet('Капитал')
    ]);
  }, [loadSheet]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const value = useMemo(() => ({ sheets, loadSheet, refreshAll }), [sheets, loadSheet, refreshAll]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

export function useDataContext() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useDataContext must be used within DataProvider');
  }
  return context;
}
