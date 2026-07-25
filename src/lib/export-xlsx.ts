import * as XLSX from "xlsx";

export function todayStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export type Sheet = {
  name: string;
  rows: Record<string, unknown>[];
  headers?: string[];
};

export function exportXlsx(baseName: string, sheets: Sheet[]) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows, {
      header: s.headers,
    });
    // Auto column width
    if (s.rows.length > 0) {
      const keys = s.headers ?? Object.keys(s.rows[0]);
      ws["!cols"] = keys.map((k) => {
        const max = Math.max(
          k.length,
          ...s.rows.map((r) => String(r[k] ?? "").length),
        );
        return { wch: Math.min(Math.max(max + 2, 10), 50) };
      });
    }
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, `${baseName}_${todayStamp()}.xlsx`);
}

export function fmtDate(v: string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-CA");
}

export function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-CA");
}
