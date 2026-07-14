function escapeCsvCell(value: string | number) {
  const normalized = String(value).replace(/"/g, '""');
  return `"${normalized}"`;
}

export function buildCsvContent(
  headers: string[],
  rows: Array<Array<string | number>>
) {
  return (
    "\uFEFF" +
    [headers, ...rows]
      .map((row) => row.map(escapeCsvCell).join(";"))
      .join("\r\n")
  );
}
