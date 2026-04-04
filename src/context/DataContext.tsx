import React, { createContext, useContext, useState } from 'react';

interface DataContextType {
  thermometerResults: any[];
  thermometerSummary: any;
  mineralResults: any[];
  biotiteResults: any[];
  biotiteSummary: any;
  setThermometerResults: (r: any[]) => void;
  setThermometerSummary: (s: any) => void;
  setMineralResults: (r: any[]) => void;
  setBiotiteResults: (r: any[]) => void;
  setBiotiteSummary: (s: any) => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [thermometerResults, setThermometerResults] = useState<any[]>([]);
  const [thermometerSummary, setThermometerSummary] = useState<any>(null);
  const [mineralResults, setMineralResults] = useState<any[]>([]);
  const [biotiteResults, setBiotiteResults] = useState<any[]>([]);
  const [biotiteSummary, setBiotiteSummary] = useState<any>(null);

  return (
    <DataContext.Provider value={{
      thermometerResults, thermometerSummary,
      mineralResults,
      biotiteResults, biotiteSummary,
      setThermometerResults, setThermometerSummary,
      setMineralResults,
      setBiotiteResults, setBiotiteSummary,
    }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};
