import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtG } from "@/lib/containers";
import { formatZonedDate } from "@/lib/dates";
import type { Tables } from "@/integrations/supabase/types";

type Container = Tables<"stock_containers">;
type Lot = Tables<"inventory_lots">;

/**
 * Rétentions QA d'une batch : sacs de rétention (bloqués) rattachés aux lots
 * de la batch, ainsi que les lots de nature « rétention ». Lecture seule.
 */
export function RetentionSection({ batchId }: { batchId: string }) {
  const [rows, setRows] = useState<{ c: Container; lot: Lot | null }[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: lots } = await supabase
        .from("inventory_lots")
        .select("*")
        .eq("batch_id", batchId);
      const lotList = (lots ?? []) as Lot[];
      if (lotList.length === 0) {
        if (!cancelled) setRows([]);
        return;
      }
      const byId: Record<string, Lot> = {};
      lotList.forEach((l) => (byId[l.id] = l));
      const { data: cs } = await supabase
        .from("stock_containers")
        .select("*")
        .in(
          "lot_id",
          lotList.map((l) => l.id),
        )
        .eq("container_type", "retention")
        .order("created_at", { ascending: true });
      if (cancelled) return;
      setRows(((cs ?? []) as Container[]).map((c) => ({ c, lot: byId[c.lot_id] ?? null })));
    })();
    return () => {
      cancelled = true;
    };
  }, [batchId]);

  const total = (rows ?? []).reduce((a, r) => a + Number(r.c.net_weight_grams ?? 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-muted-foreground" /> Rétentions QA
        </CardTitle>
        <CardDescription>
          Sacs de rétention bloqués rattachés aux lots de cette batch — lecture seule, aucun
          mouvement ni timbre possible.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sac</TableHead>
                <TableHead>Lot</TableHead>
                <TableHead className="text-right">Poids net (g)</TableHead>
                <TableHead>Emplacement</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows === null &&
                [...Array(2)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(6)].map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              {rows?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                    Aucune rétention pour cette batch.
                  </TableCell>
                </TableRow>
              )}
              {rows?.map(({ c, lot }) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    {c.container_code}{" "}
                    <Badge variant="outline" className="ml-1 border-amber-500/30 bg-amber-500/15 text-amber-400">
                      Rétention
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {lot ? (
                      <Link
                        to="/inventory/$id"
                        params={{ id: lot.id }}
                        className="text-muted-foreground hover:underline"
                      >
                        {lot.lot_number}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtG(Number(c.net_weight_grams ?? 0))}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.location ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.notes ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatZonedDate(c.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {rows && rows.length > 0 && (
          <p className="pt-3 text-sm tabular-nums">
            Total rétention : <strong>{fmtG(total)} g</strong> sur <strong>{rows.length}</strong>{" "}
            sac(s)
          </p>
        )}
      </CardContent>
    </Card>
  );
}
