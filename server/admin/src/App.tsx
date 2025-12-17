import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Users } from './pages/Users';
import { Groups } from './pages/Groups';
import { Invites } from './pages/Invites';
import { Settings } from './pages/Settings';
import { Backups } from './pages/Backups';
import { AuditLog } from './pages/AuditLog';
import { api } from './api/client';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = api.getToken();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="users" element={<Users />} />
        <Route path="groups" element={<Groups />} />
        <Route path="invites" element={<Invites />} />
        <Route path="settings" element={<Settings />} />
        <Route path="backups" element={<Backups />} />
        <Route path="audit-log" element={<AuditLog />} />
      </Route>
    </Routes>
  );
}

export default App;
