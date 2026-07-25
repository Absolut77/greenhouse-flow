import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, ShieldAlert, Calendar as CalIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { exportXlsx, fmtDate } from "@/lib/export-xlsx";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Rapports mensuels — ONO Cannabis" },
      { name: "description", content: "Récapitulatif mensuel : récoltes, destructions, mouvements, timbres." },
    ],
  }),
  component: ReportsPage,
});

function monthBounds(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { startIso: start.toISOString(), endIso: end.toISOString(), start, end };
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type Data = {
  batches: any[];
  destructions: any[];
  events: any[];
  eventItems: any[];
  stampMovements: any[];
  reels: any[];
};

function ReportsPage() {
  const { roles, loading: authLoading } = useAuth();
  const canView = roles.includes("admin") || roles.includes("supervisor");
  const [ym, setYm] = useState<string>(currentMonth());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Data | null>(null);

  const bounds = useMemo(() => monthBounds(ym), [ym]);

  const load = async () => {
    setLoading(true);
    try {
      const { startIso, endIso, start, end } = bounds;
      const startDate = start.toISOString().slice(0, 10);
      const endDate = end.toISOString().slice(0, 10);

      const [batchesRes, destrRes, evRes, reelsRes, movRes] = await Promise.all([
        supabase.from("batches").select("*").gte("harvest_date", startDate).lt("harvest_date", endDate),
        supabase.from("destructions").select("*").gte("created_at", startIso).lt("created_at", endIso),
        supabase.from("events").select("*").gte("created_at", startIso).lt("created_at", endIso),
        supabase.from("excise_reels").select("*"),
        (supabase as any).from("stamp_movements").select("*").gte("created_at", startIso).lt("created_at", endIso),
      ]);

      const events = (evRes.data ?? []) as any[];
      let items: any[] = [];
      if (events.length) {
        const { data: itemsData } = await (supabase as any)
          .from("event_items")
          .select("*, inventory_lots(lot_number, batch_id, lot_kind, product_type)")
          .in("event_id", events.map((e) => e.id));
        items = itemsData ?? [];
      }

      setData({
        batches: (batchesRes.data ?? []) as any[],
        destructions: (destrRes.data ?? []) as any[],
        events,
        eventItems: items,
        stampMovements: (movRes.data ?? []) as any[],
        reels: (reelsRes.data ?? []) as any[],
      });
    } catch (e: any) {
      toast.error(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canView) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ym, canView]);

  if (authLoading) return <div className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!canView) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-destructive" />
          <p className="font-medium">Accès réservé aux administrateurs et superviseurs.</p>
        </Card>
      </div>
    );
  }

  // --- Aggregations ---
  const batchesTotalWet = (data?.batches ?? []).reduce(
    (s, b) => s + Number(b.plant_count ?? 0) * Number(b.weight_per_plant ?? 0),
    0,
  );

  const destrByPhase = { fresh: 0, dry: 0, other: 0, sanitation: 0 };
  for (const d of data?.destructions ?? []) {
    if (d.is_sanitation_log) destrByPhase.sanitation += Number(d.weight_grams ?? 0);
    else if (d.phase === "fresh") destrByPhase.fresh += Number(d.weight_grams ?? 0);
    else if (d.phase === "dry") destrByPhase.dry += Number(d.weight_grams ?? 0);
    else destrByPhase.other += Number(d.weight_grams ?? 0);
  }

  const evByType: Record<string, number> = {};
  for (const e of data?.events ?? []) {
    evByType[e.event_type] = (evByType[e.event_type] ?? 0) + 1;
  }

  const flow = { inG: 0, outG: 0, inU: 0, outU: 0 };
  for (const it of data?.eventItems ?? []) {
    if (it.direction === "in") { flow.inG += Number(it.quantity_grams ?? 0); flow.inU += Number(it.units ?? 0); }
    else if (it.direction === "out") { flow.outG += Number(it.quantity_grams ?? 0); flow.outU += Number(it.units ?? 0); }
  }

  const stampsBy = { used: 0, destroyed: 0, returned: 0 };
  for (const m of data?.stampMovements ?? []) {
    const k = m.movement_type as keyof typeof stampsBy;
    if (k in stampsBy) stampsBy[k] += Number(m.quantity ?? 0);
  }
  const reelsAvailable = (data?.reels ?? []).filter((r) => r.status === "available").length;
  const reelsDepleted = (data?.reels ?? []).filter((r) => r.status === "depleted").length;

  const doExport = () => {
    if (!data) return;
    const summary = [
      { Indicateur: "Récoltes (nb batches)", Valeur: data.batches.length },
      { Indicateur: "Récolte humide totale (g)", Valeur: batchesTotalWet.toFixed(2) },
      { Indicateur: "Destruction Fresh (g)", Valeur: destrByPhase.fresh.toFixed(2) },
      { Indicateur: "Destruction Dry (g)", Valeur: destrByPhase.dry.toFixed(2) },
      { Indicateur: "Destruction autre (g)", Valeur: destrByPhase.other.toFixed(2) },
      { Indicateur: "Sanitations (g)", Valeur: destrByPhase.sanitation.toFixed(2) },
      { Indicateur: "Événements (total)", Valeur: data.events.length },
      { Indicateur: "Entrées stock (g)", Valeur: flow.inG.toFixed(2) },
      { Indicateur: "Sorties stock (g)", Valeur: flow.outG.toFixed(2) },
      { Indicateur: "Entrées stock (unités)", Valeur: flow.inU },
      { Indicateur: "Sorties stock (unités)", Valeur: flow.outU },
      { Indicateur: "Timbres utilisés", Valeur: stampsBy.used },
      { Indicateur: "Timbres détruits", Valeur: stampsBy.destroyed },
      { Indicateur: "Timbres retournés", Valeur: stampsBy.returned },
      { Indicateur: "Rouleaux disponibles", Valeur: reelsAvailable },
      { Indicateur: "Rouleaux épuisés", Valeur: reelsDepleted },
    ];
    const batchesRows = data.batches.map((b) => ({
      Batch: b.batch_number, Strain: b.strain, Récolte: fmtDate(b.harvest_date),
      Plants: b.plant_count, "Poids humide/plant (g)": b.weight_per_plant,
      "Poids humide total (g)": (Number(b.plant_count ?? 0) * Number(b.weight_per_plant ?? 0)).toFixed(2),
      Statut: b.status,
    }));
    const destrRows = data.destructions.map((d) => ({
      Date: fmtDate(d.created_at), Phase: d.is_sanitation_log ? "sanitation" : (d.phase ?? "—"),
      Étape: d.stage_code ?? "", "Poids (g)": d.weight_grams,
      "Type sanitation": d.sanitation_type ?? "", Raison: d.reason ?? "", Commentaire: d.comments ?? "",
    }));
    const evRows = data.events.map((e) => ({
      Événement: e.event_number, Type: e.event_type, Statut: e.status,
      Créé: fmtDate(e.created_at), Clôturé: fmtDate(e.completed_at),
      "Perte transfo (g)": e.processing_loss_grams ?? "",
      "Destruction dry (g)": e.dry_destroyed_grams ?? "",
      Notes: e.notes ?? "",
    }));
    const itemsRows = data.eventItems.map((it: any) => ({
      Événement: data.events.find((e) => e.id === it.event_id)?.event_number ?? "",
      Direction: it.direction,
      Lot: it.inventory_lots?.lot_number ?? "",
      "Type lot": it.inventory_lots?.lot_kind ?? "",
      "Poids (g)": it.quantity_grams ?? "",
      Unités: it.units ?? "",
    }));
    const stampRows = data.stampMovements.map((m) => ({
      Date: fmtDate(m.created_at), Type: m.movement_type, Quantité: m.quantity,
      Rouleau: data.reels.find((r) => r.id === m.reel_id)?.serial_number ?? "",
    }));
    const reelRows = data.reels.map((r) => ({
      "N° série": r.serial_number, Province: r.province, Boîte: r.box_id,
      "Quantité initiale": r.original_quantity, "Spoilés réception": r.spoiled_at_reception,
      Statut: r.status, Réception: fmtDate(r.received_at),
    }));

    exportXlsx(`rapport_${ym}`, [
      { name: "Synthèse", rows: summary },
      { name: "Récoltes", rows: batchesRows },
      { name: "Destructions", rows: destrRows },
      { name: "Événements", rows: evRows },
      { name: "Mouvements stock", rows: itemsRows },
      { name: "Mouvements timbres", rows: stampRows },
      { name: "Rouleaux (stock actuel)", rows: reelRows },
    ]);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Rapports mensuels</h1>
          <p className="text-sm text-muted-foreground">
            Récapitulatif : récoltes, destructions, mouvements de stock et de timbres.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <CalIcon className="h-3 w-3" /> Mois
            </label>
            <Input type="month" value={ym} onChange={(e) => setYm(e.target.value)} className="w-[180px]" />
          </div>
          <Button variant="outline" onClick={() => window.print()}>Imprimer / PDF</Button>
          <Button onClick={doExport} disabled={!data || loading}>
            <Download className="mr-1 h-4 w-4" /> Excel
          </Button>
        </div>
      </div>

      {loading || !data ? (
        <Card className="p-8 text-center">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Récoltes" value={String(data.batches.length)} sub={`${batchesTotalWet.toFixed(0)} g humide`} />
            <Stat label="Destruction Fresh" value={`${destrByPhase.fresh.toFixed(0)} g`} tone="warn" />
            <Stat label="Destruction Dry" value={`${destrByPhase.dry.toFixed(0)} g`} tone="warn" />
            <Stat label="Sanitations" value={`${destrByPhase.sanitation.toFixed(0)} g`} />
            <Stat label="Entrées stock" value={`${flow.inG.toFixed(0)} g`} sub={`${flow.inU} unités`} tone="ok" />
            <Stat label="Sorties stock" value={`${flow.outG.toFixed(0)} g`} sub={`${flow.outU} unités`} tone="warn" />
            <Stat label="Timbres utilisés" value={String(stampsBy.used)} sub={`${stampsBy.destroyed} détruits / ${stampsBy.returned} retournés`} />
            <Stat label="Rouleaux (état actuel)" value={String(reelsAvailable)} sub={`${reelsDepleted} épuisés`} />
          </div>

          <Section title={`Récoltes du mois (${data.batches.length})`}>
            {data.batches.length === 0 ? <Empty /> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch</TableHead><TableHead>Strain</TableHead>
                    <TableHead>Récolte</TableHead><TableHead className="text-right">Plants</TableHead>
                    <TableHead className="text-right">Poids humide total</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.batches.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono text-xs">{b.batch_number}</TableCell>
                      <TableCell>{b.strain}</TableCell>
                      <TableCell>{fmtDate(b.harvest_date)}</TableCell>
                      <TableCell className="text-right">{b.plant_count}</TableCell>
                      <TableCell className="text-right">
                        {(Number(b.plant_count ?? 0) * Number(b.weight_per_plant ?? 0)).toFixed(1)} g
                      </TableCell>
                      <TableCell><Badge variant="outline">{b.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Section>

          <Section title={`Destructions & sanitations (${data.destructions.length})`}>
            {data.destructions.length === 0 ? <Empty /> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead><TableHead>Phase</TableHead>
                    <TableHead>Étape</TableHead><TableHead className="text-right">Poids (g)</TableHead>
                    <TableHead>Commentaire</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.destructions.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>{fmtDate(d.created_at)}</TableCell>
                      <TableCell>
                        {d.is_sanitation_log
                          ? <Badge className="border-transparent bg-sky-500/20 text-sky-400">sanitation</Badge>
                          : d.phase === "fresh"
                            ? <Badge className="border-transparent bg-amber-500/20 text-amber-400">fresh</Badge>
                            : d.phase === "dry"
                              ? <Badge className="border-transparent bg-orange-500/20 text-orange-400">dry</Badge>
                              : <Badge variant="outline">{d.phase ?? "—"}</Badge>}
                      </TableCell>
                      <TableCell className="text-xs">{d.stage_code ?? "—"}</TableCell>
                      <TableCell className="text-right">{Number(d.weight_grams ?? 0).toFixed(2)}</TableCell>
                      <TableCell className="text-xs max-w-md truncate">{d.comments ?? d.reason ?? ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Section>

          <Section title={`Événements du mois (${data.events.length})`}>
            {data.events.length === 0 ? <Empty /> : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(evByType).map(([t, n]) => (
                    <Badge key={t} variant="outline">{t}: {n}</Badge>
                  ))}
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>N°</TableHead><TableHead>Type</TableHead>
                      <TableHead>Statut</TableHead><TableHead>Créé</TableHead>
                      <TableHead>Clôturé</TableHead>
                      <TableHead className="text-right">Perte</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.events.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="font-mono text-xs">{e.event_number}</TableCell>
                        <TableCell>{e.event_type}</TableCell>
                        <TableCell><Badge variant="outline">{e.status}</Badge></TableCell>
                        <TableCell>{fmtDate(e.created_at)}</TableCell>
                        <TableCell>{fmtDate(e.completed_at)}</TableCell>
                        <TableCell className="text-right text-xs">
                          {e.processing_loss_grams ? `${Number(e.processing_loss_grams).toFixed(1)} g` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Section>

          <Section title={`Mouvements de timbres (${data.stampMovements.length})`}>
            {data.stampMovements.length === 0 ? <Empty /> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead><TableHead>Type</TableHead>
                    <TableHead>Rouleau</TableHead>
                    <TableHead className="text-right">Quantité</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.stampMovements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>{fmtDate(m.created_at)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{m.movement_type}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {data.reels.find((r) => r.id === m.reel_id)?.serial_number ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">{m.quantity}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" | "ok" }) {
  const t = tone === "warn" ? "text-amber-400" : tone === "ok" ? "text-emerald-400" : "";
  return (
    <Card className="p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${t}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">{title}</h2>
      {children}
    </Card>
  );
}

function Empty() {
  return <p className="text-sm italic text-muted-foreground">Aucune donnée sur cette période.</p>;
}
