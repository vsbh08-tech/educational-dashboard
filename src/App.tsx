import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './layout/Layout';
import { DataProvider } from './lib/data';
import { DashboardPage } from './pages/DashboardPage';
import { MoneyPage } from './pages/MoneyPage';
import { ProfitPage } from './pages/ProfitPage';
import { CapitalPage } from './pages/CapitalPage';

const App = () => {
  return (
    <DataProvider>
      <HashRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/money" element={<MoneyPage />} />
            <Route path="/profit" element={<ProfitPage />} />
            <Route path="/capital" element={<CapitalPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Layout>
      </HashRouter>
    </DataProvider>
  );
};

export default App;
