function csvEscape(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(
  rows: Array<Record<string, unknown>>,
  columns: string[]
): string {
  const header = columns.join(',');
  const lines = rows.map((row) =>
    columns.map((col) => csvEscape(row[col])).join(',')
  );
  return [header, ...lines].join('\r\n') + '\r\n';
}
