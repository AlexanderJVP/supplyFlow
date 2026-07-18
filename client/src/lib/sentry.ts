import * as Sentry from '@sentry/react';

// Optional. Leave VITE_SENTRY_DSN unset locally to run without error
// tracking -- init() is simply never called.
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
    tracePropagationTargets: [import.meta.env.VITE_API_URL || '/api'],
  });
}

export const SentryErrorBoundary = Sentry.ErrorBoundary;
