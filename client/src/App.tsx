import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import ItemList from './pages/items/ItemList';

const queryClient = new QueryClient();

function Routes() {
  const { session, loading } = useAuth();

  if (loading) return <p style={{ padding: 24 }}>Loading…</p>;
  return session ? <ItemList /> : <Login />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Routes />
      </AuthProvider>
    </QueryClientProvider>
  );
}
