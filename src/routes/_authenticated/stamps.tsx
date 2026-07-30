import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Download } from "lucide-react";
import { formatDateOnly, formatZonedDate } from "@/lib/dates";
import { exportXlsx } from "@/lib/export-xlsx";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { ProvinceBadge } from "@/lib/provinces";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { AppliedStampsSummary } from "@/components/stamps/applied-stamps-summary";

import type { Tables } from "@/integrations/supabase/types";

type Reel = Tables<"excise_reels">;
type Movement = Tables<"stamp_movements">;

const searchSchema = z.object({
  status: fallback(z.string(), "all").default("all"),
  province: fallback(z.string(), "all").default("all"),
});

export const Route = createFileRoute("/_authenticated/stamps")({
  head: () => ({ meta: [{ title: "Timbres d'accise — ONO Cannabis" }] }),
  validateSearch: zodValidator(searchSchema),
  component: StampsPage,
});

export const PROVINCES = [
  { value: "SQDC", label: "SQDC" },
  { value: "OCS", label: "OCS" },
  { value: "MB", label: "MB" },
  { value: "NB", label: "NB" },
];

export const REEL_STATUS_VARIANTS: Record<
  string,
  { label: string; className: string }
> = {
  available: {
    label: "Disponible",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  depleted: {
    label: "Épuisé",
    className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  },
};

export function ReelStatusBadge({ status }: { status: string | null }) {
  const key = status ?? "";
  const v = REEL_STATUS_VARIANTS[key] ?? {
    label: status ?? "—",
    className: "bg-muted text-muted-foreground",
  };
  return (
    <Badge variant="outline" className={v.className}>
      {v.label}
    </Badge>
  );
}

export function computeBalance(
  reel: Pick<Reel, "original_quantity" | "spoiled_at_reception">,
  movements: Pick<Movement, "movement_type" | "quantity">[],
) {
  const used = movements
    .filter((m) => m.movement_type === "used")
    .reduce((s, m) => s + (m.quantity ?? 0), 0);
  const destroyed = movements
    .filter((m) => m.movement_type === "destroyed")
    .reduce((s, m) => s + (m.quantity ?? 0), 0);
  const returned = movements
    .filter((m) => m.movement_type === "returned")
    .reduce((s, m) => s + (m.quantity ?? 0), 0);
  const balance =
    (reel.original_quantity ?? 0) -
    (reel.spoiled_at_reception ?? 0) -
    used -
    destroyed +
    returned;
  return { used, destroyed, returned, balance };
}

function StampsPage() {
  const navigate = useNavigate();
  const { status: statusFilter, province: provinceFilter } = Route.useSearch();
  const { roles } = useAuth();
  const isViewerOnly = roles.length > 0 && roles.every((r) => r === "viewer");
  const [reels, setReels] = useState<Reel[] | null>(null);
  const [movementsByReel, setMovementsByReel] = useState<
    Record<string, Movement[]>
  >({});
  const [error, setError] = useState<string | null>(null);

  const setStatusFilter = (v: string) =>
    navigate({ to: "/stamps", search: { status: v, province: provinceFilter } });
  const setProvinceFilter = (v: string) =>
    navigate({ to: "/stamps", search: { status: statusFilter, province: v } });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      let query = supabase
        .from("excise_reels")
        .select("*")
        .order("received_at", { ascending: false, nullsFirst: false });
      if (provinceFilter !== "all") query = query.eq("province", provinceFilter);
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      const { data, error } = await query;
      if (cancelled) return;
      if (error) {
        setError(error.message);
        return;
      }
      const rows = data ?? [];
      setReels(rows);
      const ids = rows.map((r) => r.id);
      if (ids.length > 0) {
        const { data: mvts } = await supabase
          .from("stamp_movements")
          .select("*")
          .in("reel_id", ids);
        const m: Record<string, Movement[]> = {};
        (mvts ?? []).forEach((mv) => {
          (m[mv.reel_id] ??= []).push(mv);
        });
        if (!cancelled) setMovementsByReel(m);
      } else setMovementsByReel({});
    })();
    return () => {
      cancelled = true;
    };
  }, [provinceFilter, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Timbres d'accise</h1>
          <p className="text-sm text-muted-foreground">
            Rouleaux de timbres provinciaux et mouvements associés.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              const rows = (reels ?? []).map((r) => {
                const { used, destroyed, balance } = computeBalance(r, movementsByReel[r.id] ?? []);
                return {
                  "Numéro": r.serial_number,
                  Province: r.province,
                  "Box ID": r.box_id ?? "",
                  Statut: r.status,
                  "Qté originale": r.original_quantity,
                  "Spoiled": r.spoiled_at_reception ?? 0,
                  "Utilisés": used,
                  "Détruits": destroyed,
                  "Balance": balance,
                  "Reçu le": r.received_at ?? "",
                };
              });
              exportXlsx(`stamps-${new Date().toISOString().slice(0, 10)}`, [
                { name: "Rouleaux", rows },
              ]);
            }}
          >
            <Download className="mr-1 h-4 w-4" /> Exporter Excel
          </Button>
          {!isViewerOnly && (
            <Button onClick={() => navigate({ to: "/stamps/new" })}>
              <Plus className="mr-1 h-4 w-4" /> Nouveau rouleau
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Province</span>
          <Select value={provinceFilter} onValueChange={setProvinceFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes</SelectItem>
              {PROVINCES.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Statut</span>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              <SelectItem value="available">Disponible</SelectItem>
              <SelectItem value="depleted">Épuisé</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="stock" className="space-y-4">
        <TabsList>
          <TabsTrigger value="stock">Stock réel (rouleaux)</TabsTrigger>
          <TabsTrigger value="applied">Timbres apposés</TabsTrigger>
          <TabsTrigger value="runs">Packaging Runs</TabsTrigger>
        </TabsList>


        <TabsContent value="stock">
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Numéro de série</TableHead>
                    <TableHead>Province</TableHead>
                    <TableHead>Box ID</TableHead>
                    <TableHead className="text-right">Original</TableHead>
                    <TableHead className="text-right">Spoiled</TableHead>
                    <TableHead className="text-right">Utilisés</TableHead>
                    <TableHead className="text-right">Détruits</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Reçu le</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {error && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-destructive">
                        {error}
                      </TableCell>
                    </TableRow>
                  )}
                  {!error && reels === null && (
                    <>
                      {[...Array(3)].map((_, i) => (
                        <TableRow key={i}>
                          {[...Array(10)].map((_, j) => (
                            <TableCell key={j}>
                              <Skeleton className="h-4 w-full" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </>
                  )}
                  {reels && reels.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                        Aucun rouleau pour le moment.
                      </TableCell>
                    </TableRow>
                  )}
                  {reels?.map((r) => {
                    const { used, destroyed, balance } = computeBalance(r, movementsByReel[r.id] ?? []);
                    return (
                      <TableRow
                        key={r.id}
                        className="cursor-pointer"
                        onClick={() => navigate({ to: "/stamps/$id", params: { id: r.id } })}
                      >
                        <TableCell className="font-medium">
                          <Link
                            to="/stamps/$id"
                            params={{ id: r.id }}
                            className="hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {r.serial_number}
                          </Link>
                        </TableCell>
                        <TableCell><ProvinceBadge province={r.province} /></TableCell>
                        <TableCell>{r.box_id ?? "—"}</TableCell>
                        <TableCell className="text-right">{r.original_quantity ?? "—"}</TableCell>
                        <TableCell className="text-right">{r.spoiled_at_reception ?? 0}</TableCell>
                        <TableCell className="text-right">{used}</TableCell>
                        <TableCell className="text-right">{destroyed}</TableCell>
                        <TableCell className="text-right font-medium">{balance}</TableCell>
                        <TableCell>
                          <ReelStatusBadge status={r.status} />
                        </TableCell>
                        <TableCell>
                          {formatDateOnly(r.received_at)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="applied">
          <AppliedStampsSummary />
        </TabsContent>

        <TabsContent value="runs">
          <PackagingRunsTable />
        </TabsContent>

      </Tabs>
    </div>
  );
}

function PackagingRunsTable() {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => {
    (async () => {
      const { data: mv } = await (supabase as any)
        .from("stamp_movements")
        .select("id, quantity, movement_type, created_at, event_id, reel_id")
        .order("created_at", { ascending: false })
        .limit(200);
      const list = (mv ?? []) as any[];
      const eventIds = Array.from(new Set(list.map((r) => r.event_id).filter(Boolean)));
      const reelIds = Array.from(new Set(list.map((r) => r.reel_id).filter(Boolean)));
      const [{ data: evs }, { data: rls }] = await Promise.all([
        eventIds.length
          ? (supabase as any).from("events").select("id,event_number,event_type,status").in("id", eventIds)
          : Promise.resolve({ data: [] as any[] }),
        reelIds.length
          ? (supabase as any).from("excise_reels").select("id,serial_number,province").in("id", reelIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const em: Record<string, any> = {};
      (evs ?? []).forEach((e: any) => (em[e.id] = e));
      const rm: Record<string, any> = {};
      (rls ?? []).forEach((r: any) => (rm[r.id] = r));
      setRows(list.map((r) => ({ ...r, event: em[r.event_id], reel: rm[r.reel_id] })));
    })();
  }, []);

  return (
    <Card>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Événement</TableHead>
              <TableHead>Rouleau</TableHead>
              <TableHead>Province</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Quantité</TableHead>
              <TableHead>Statut événement</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows === null && (
              <TableRow><TableCell colSpan={7}><Skeleton className="h-4 w-full" /></TableCell></TableRow>
            )}
            {rows && rows.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Aucun mouvement.</TableCell></TableRow>
            )}
            {rows?.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{formatZonedDate(r.moved_at ?? r.created_at)}</TableCell>
                <TableCell>
                  {r.event ? (
                    <Link to="/events/$id" params={{ id: r.event.id }} className="hover:underline">
                      {r.event.event_number}
                    </Link>
                  ) : "—"}
                </TableCell>
                <TableCell>
                  {r.reel ? (
                    <Link to="/stamps/$id" params={{ id: r.reel.id }} className="hover:underline">
                      {r.reel.serial_number}
                    </Link>
                  ) : "—"}
                </TableCell>
                <TableCell><ProvinceBadge province={r.reel?.province} /></TableCell>
                <TableCell>
                  <Badge variant="outline">{r.movement_type}</Badge>
                </TableCell>
                <TableCell className="text-right font-medium">{r.quantity}</TableCell>
                <TableCell>{r.event?.status ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
