import { api } from './api';

// The export endpoints require the auth header, so a plain <a href> can't
// hit them directly (browsers don't attach custom headers to navigation).
// Fetch through the authenticated axios instance instead and trigger the
// download via a client-side Blob URL.
export async function downloadCsv(path: string, filename: string) {
  const response = await api.get(path, { responseType: 'blob' });
  const url = URL.createObjectURL(response.data as Blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
