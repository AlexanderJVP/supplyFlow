import { useCallback, useState } from 'react';

import { downloadCsv } from '../lib/downloadCsv';

export function useDownloadCsv() {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = useCallback(async (path: string, filename: string) => {
    setIsDownloading(true);
    setError(null);
    try {
      await downloadCsv(path, filename);
    } catch {
      setError('Failed to export CSV. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  }, []);

  return { download, isDownloading, error };
}
