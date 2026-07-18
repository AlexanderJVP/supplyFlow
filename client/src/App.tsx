import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
} from 'react-router-dom';

import { AuthProvider, useAuth } from './context/AuthContext';
import { usePermission } from './hooks/usePermission';
import Login from './pages/Login';
import ItemList from './pages/items/ItemList';
import StockDashboard from './pages/inventory/StockDashboard';
import ProductionOrders from './pages/production/ProductionOrders';
import Proposals from './pages/proposals/Proposals';
import Admin from './pages/admin/Admin';

const queryClient = new QueryClient();

function navLinkStyle({ isActive }: { isActive: boolean }) {
  return {
    textDecoration: 'none',
    color: isActive ? '#111' : '#555',
    fontWeight: isActive ? 700 : 400,
  };
}

function ProtectedLayout() {
  const { session, loading, signOut } = useAuth();
  const canManageUsers = usePermission('admin.manage_users');
  const canManageRoles = usePermission('admin.manage_roles');

  if (loading) return <p style={{ padding: 24 }}>Loading…</p>;
  if (!session) return <Navigate to="/login" replace />;

  return (
    <div>
      <nav
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 24px',
          borderBottom: '1px solid #ccc',
        }}
      >
        <div style={{ display: 'flex', gap: 16 }}>
          <NavLink to="/items" style={navLinkStyle}>
            Items
          </NavLink>
          <NavLink to="/inventory" style={navLinkStyle}>
            Inventory
          </NavLink>
          <NavLink to="/production" style={navLinkStyle}>
            Production
          </NavLink>
          <NavLink to="/proposals" style={navLinkStyle}>
            Proposals
          </NavLink>
          {(canManageUsers || canManageRoles) && (
            <NavLink to="/admin" style={navLinkStyle}>
              Admin
            </NavLink>
          )}
        </div>
        <button onClick={signOut}>Sign out</button>
      </nav>

      <Outlet />
    </div>
  );
}

function LoginRoute() {
  const { session, loading } = useAuth();

  if (loading) return <p style={{ padding: 24 }}>Loading…</p>;
  if (session) return <Navigate to="/items" replace />;
  return <Login />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/items" element={<ItemList />} />
        <Route path="/inventory" element={<StockDashboard />} />
        <Route path="/production" element={<ProductionOrders />} />
        <Route path="/proposals" element={<Proposals />} />
        <Route path="/admin" element={<Admin />} />
      </Route>
      <Route path="*" element={<Navigate to="/items" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
