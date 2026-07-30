import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Download } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatZonedDate } from "@/lib/dates";
import { exportXlsx } from "@/lib/export-xlsx";
import { fetchAppliedStamps, monthKey, type AppliedRow } from "@/lib/stamps";

const ALL = "all";

const BUCKETS = [
  {
    key: "standby" as const,
    label: "Standby (timbré en stock)",
    hint: "Lots timbrés encore en inventaire",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  {
    key: "shipped" as const,
    label: "Expédiés",
    hint: "Lots timbrés sortis de l'usine",
    className: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  },
  {
    key: "returned" as const,
    label: "Retours",
    hint: "Timbres retournés au rouleau",
    className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
];

const bucketMeta = (k: string) => BUCKETS.find((b) => b.key === k)!;

export function AppliedStampsSummary() {
  const [rows, setRows] = useState<AppliedRow[] | null>(null);
  const [month, setMonth] = useState<string>(ALL);

  useEffect(() => {
    (async () => {
      try {
        setRows(await fetchAppliedStamps());
      } catch {
        setRows([]);
      }
    })();
  }, []);

  const months = useMemo(() => {
    const s = new Set((rows ?? []).map((r) => monthKey(r.moved_at)).filter(Boolean));
    return [...s].sort().reverse();
  }, [rows]);

  const filtered = useMemo(
    () => (rows ?? []).filter((r) => month === ALL || monthKey(r.moved_at) === month),
    [rows, month],
  );

  const totals = useMemo(() => {
    const t = { standby: 0, shipped: 0, returned: 0 };
    filtered.forEach((r) => (t[r.bucket] += r.quantity));
    return t;
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Période</span>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Toutes les périodes</SelectItem>
              {months.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            exportXlsx(`timbres-apposes-${month === ALL ? "tout" : month}`, [
              {
                name: "Timbres apposés",
                rows: filtered.map((r) => ({
                  Date: formatZonedDate(r.moved_at),
                  État: bucketMeta(r.bucket).label,
                  Lot: r.lot_number,
                  "Nature du lot": r.lot_kind ?? "",
                  "Statut du lot": r.lot_status ?? "",
                  Rouleau: r.reel_serial,
                  Province: r.province ?? "",
                  Timbres: r.quantity,
                })),
              },
            ])
          }
        >
          <Download className="mr-1 h-4 w-4" /> Exporter Excel
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {BUCKETS.map((b) => (
          <Card key={b.key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {b.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums">{totals[b.key]}</p>
              <p className="text-xs text-muted-foreground">{b.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>État</TableHead>
                <TableHead>Lot</TableHead>
                <TableHead>Statut lot</TableHead>
                <TableHead>Rouleau</TableHead>
                <TableHead>Province</TableHead>
                <TableHead className="text-right">Timbres</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows === null && (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                </TableRow>
              )}
              {rows !== null && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    Aucun timbre apposé sur cette période.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{formatZonedDate(r.moved_at)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={bucketMeta(r.bucket).className}>
                      {bucketMeta(r.bucket).label}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link
                      to="/inventory/$id"
                      params={{ id: r.lot_id }}
                      className="hover:underline"
                    >
                      {r.lot_number}
                    </Link>
                  </TableCell>
                  <TableCell>{r.lot_status ?? "—"}</TableCell>
                  <TableCell>{r.reel_serial}</TableCell>
                  <TableCell><ProvinceBadge province={r.province} /></TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {r.quantity}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
