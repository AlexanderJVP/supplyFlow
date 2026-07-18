import React from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import { initSentry, SentryErrorBoundary } from './lib/sentry';

initSentry();

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <SentryErrorBoundary fallback={<p>Something went wrong.</p>}>
      <App />
    </SentryErrorBoundary>
  </React.StrictMode>
);
