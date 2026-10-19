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
import { usePermissions } from './hooks/usePermission';
import { visiblePages } from './lib/permissions';
import Login from './pages/Login';
import ItemList from './pages/items/ItemList';
import ItemDetail from './pages/items/ItemDetail';
import StockDashboard from './pages/inventory/StockDashboard';
import ProductionOrders from './pages/production/ProductionOrders';
import Proposals from './pages/proposals/Proposals';
import Admin from './pages/admin/Admin';

const queryClient = new QueryClient();

function useVisiblePages() {
  return visiblePages(usePermissions());
}

function NoAccess({ message }: { message: string }) {
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: 24 }}>
      <p>{message}</p>
    </div>
  );
}

// Hiding is for clarity only -- the server enforces the same permissions.
function RequirePage({
  path,
  children,
}: {
  path: string;
  children: JSX.Element;
}) {
  const visible = useVisiblePages().some((page) => page.path === path);
  if (!visible) {
    return <NoAccess message="You don't have access to this page." />;
  }
  return children;
}

function HomeRedirect() {
  const [first] = useVisiblePages();
  if (!first) {
    return (
      <NoAccess message="You don't have access to any page yet — contact your administrator." />
    );
  }
  return <Navigate to={first.path} replace />;
}

function navLinkStyle({ isActive }: { isActive: boolean }) {
  return {
    textDecoration: 'none',
    color: isActive ? '#111' : '#555',
    fontWeight: isActive ? 700 : 400,
  };
}

function ProtectedLayout() {
  const { session, loading, signOut } = useAuth();
  const visiblePages = useVisiblePages();

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
          {visiblePages.map((page) => (
            <NavLink key={page.path} to={page.path} style={navLinkStyle}>
              {page.label}
            </NavLink>
          ))}
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
  if (session) return <Navigate to="/" replace />;
  return <Login />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route element={<ProtectedLayout />}>
        <Route
          path="/items"
          element={
            <RequirePage path="/items">
              <ItemList />
            </RequirePage>
          }
        />
        <Route
          path="/items/:id"
          element={
            <RequirePage path="/items">
              <ItemDetail />
            </RequirePage>
          }
        />
        <Route
          path="/inventory"
          element={
            <RequirePage path="/inventory">
              <StockDashboard />
            </RequirePage>
          }
        />
        <Route
          path="/production"
          element={
            <RequirePage path="/production">
              <ProductionOrders />
            </RequirePage>
          }
        />
        <Route
          path="/proposals"
          element={
            <RequirePage path="/proposals">
              <Proposals />
            </RequirePage>
          }
        />
        {/* Admin keeps its own per-section check and access message. */}
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<HomeRedirect />} />
      </Route>
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
