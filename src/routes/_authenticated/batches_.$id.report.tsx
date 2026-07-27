import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Printer, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatZonedDateTime } from "@/lib/dates";

export const Route = createFileRoute("/_authenticated/batches_/$id/report")({
  component: BatchReport,
});

function fmt(v: any) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") return String(v);
  return String(v);
}
function fmtDate(v: any) {
  if (!v) return "—";
  try { return formatZonedDateTime(v); } catch { return "—"; }
}

function BatchReport() {
  const { id } = Route.useParams();
  const [loading, setLoading] = useState(true);
  const [batch, setBatch] = useState<any>(null);
  const [stages, setStages] = useState<any[]>([]);
  const [destructions, setDestructions] = useState<any[]>([]);
  const [samples, setSamples] = useState<any[]>([]);
  const [weights, setWeights] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  const [containers, setContainers] = useState<any[]>([]);
  const [bags, setBags] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const [b, s, d, sa, w, l, cc, bg] = await Promise.all([
        (supabase as any).from("batches").select("*").eq("id", id).maybeSingle(),
        (supabase as any).from("batch_stages").select("*").eq("batch_id", id).order("started_at", { ascending: true }),
        (supabase as any).from("destructions").select("*").eq("batch_id", id).order("created_at", { ascending: true }),
        (supabase as any).from("samples").select("*").eq("batch_id", id),
        (supabase as any).from("weights").select("*").eq("batch_id", id),
        (supabase as any).from("inventory_lots").select("*").eq("batch_id", id),
        (supabase as any).from("curing_containers").select("*").eq("batch_id", id),
        (supabase as any).from("packaging_bags").select("*").eq("batch_id", id),
      ]);
      setBatch(b.data);
      setStages(s.data ?? []);
      setDestructions(d.data ?? []);
      setSamples(sa.data ?? []);
      setWeights(w.data ?? []);
      setLots(l.data ?? []);
      setContainers(cc.data ?? []);
      setBags(bg.data ?? []);
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-10">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (!batch) return <div className="p-6">Batch introuvable.</div>;

  const totalDestructedFresh = destructions.filter((d) => d.phase === "fresh" && !d.is_sanitation_log).reduce((s, d) => s + Number(d.weight_grams || 0), 0);
  const totalDestructedDry = destructions.filter((d) => d.phase !== "fresh" && !d.is_sanitation_log).reduce((s, d) => s + Number(d.weight_grams || 0), 0);
  const totalBagged = bags.reduce((s, b) => s + Number(b.total_weight_grams || 0), 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Button asChild variant="ghost">
          <Link to="/batches/$id" params={{ id }}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Retour à la batch
          </Link>
        </Button>
        <Button onClick={() => window.print()}>
          <Printer className="mr-1 h-4 w-4" /> Imprimer / PDF
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card p-8 text-foreground print:border-0 print:bg-white print:text-black print:shadow-none">
        <header className="mb-6 flex items-start justify-between border-b border-border pb-4 print:border-black/20">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground print:text-gray-500">ONO Cannabis — Rapport de batch</p>
            <h1 className="mt-1 text-2xl font-bold">{batch.batch_number}</h1>
            <p className="text-sm text-muted-foreground print:text-gray-600">Variété : {fmt(batch.strain)}</p>
          </div>
          <div className="text-right text-xs text-muted-foreground print:text-gray-600">
            <div>Généré le {formatZonedDateTime()}</div>
            <div>Statut : {batch.status}</div>
          </div>
        </header>

        <section className="mb-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <Info label="Plants" value={fmt(batch.plant_count)} />
          <Info label="Récolte humide (g)" value={fmt(batch.total_harvest_weight)} />
          <Info label="Début" value={fmtDate(batch.created_at)} />
          <Info label="Emplacement" value={fmt(batch.location)} />
        </section>

        <Section title="Étapes du workflow">
          <Table
            columns={["Étape", "Début", "Fin", "Notes"]}
            rows={stages.map((s) => [s.stage_type ?? s.name, fmtDate(s.started_at), fmtDate(s.completed_at), fmt(s.notes)])}
          />
        </Section>

        <Section title="Destructions & sanitations">
          <div className="mb-2 text-xs text-muted-foreground print:text-gray-600">
            Fresh : <b>{totalDestructedFresh.toFixed(2)} g</b> · Dry : <b>{totalDestructedDry.toFixed(2)} g</b>
          </div>
          <Table
            columns={["Date", "Phase", "Type", "Poids (g)", "Personnes", "Commentaires"]}
            rows={destructions.map((d) => [
              fmtDate(d.created_at),
              d.phase ?? "—",
              d.is_sanitation_log ? "sanitation" : (d.sanitation_type ?? "destruction"),
              d.is_sanitation_log ? "—" : Number(d.weight_grams || 0).toFixed(2),
              fmt(d.person_count),
              fmt(d.comments),
            ])}
          />
        </Section>

        <Section title="Pesées">
          <Table
            columns={["Catégorie", "Poids (g)", "Contenants", "Commentaires"]}
            rows={weights.map((w) => [fmt(w.category), fmt(w.grams ?? w.weight_grams), fmt(w.container_count), fmt(w.comments)])}
          />
        </Section>

        <Section title="Conteneurs de curing">
          <Table
            columns={["Numéro", "Poids entrée (g)", "Poids sortie (g)", "Notes"]}
            rows={containers.map((c) => [fmt(c.container_number), fmt(c.entry_weight_grams), fmt(c.exit_weight_grams), fmt(c.notes)])}
          />
        </Section>

        <Section title="Bulk packaging">
          <div className="mb-2 text-xs text-muted-foreground print:text-gray-600">
            Total emballé : <b>{totalBagged.toFixed(2)} g</b> · {bags.length} sac(s)
          </div>
          <Table
            columns={["Sac", "Type", "Poids (g)", "Emplacement"]}
            rows={bags.map((b) => [fmt(b.bag_number), fmt(b.flower_type), fmt(b.total_weight_grams), fmt(b.location)])}
          />
        </Section>

        <Section title="Lots d'inventaire liés">
          <Table
            columns={["Numéro", "Type", "Nature", "Quantité (g)", "Unités", "Statut"]}
            rows={lots.map((l) => [fmt(l.lot_number), fmt(l.product_type), fmt(l.lot_kind), fmt(l.quantity_grams), fmt(l.units), fmt(l.status)])}
          />
        </Section>

        <Section title="Échantillons">
          <Table
            columns={["Numéro", "Catégorie", "Poids (g)", "Notes"]}
            rows={samples.map((s) => [fmt(s.sample_number ?? s.name), fmt(s.category), fmt(s.weight_grams), fmt(s.notes)])}
          />
        </Section>

        <footer className="mt-6 border-t border-border pt-3 text-[10px] text-muted-foreground print:border-black/20 print:text-gray-500">
          Document généré automatiquement par ONO Cannabis — À imprimer via la fonction du navigateur pour obtenir un PDF.
        </footer>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body { background: white !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground print:text-gray-500">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  );
}

function Table({ columns, rows }: { columns: string[]; rows: any[][] }) {
  if (!rows.length) {
    return <p className="text-xs text-muted-foreground print:text-gray-600">Aucune donnée.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border print:border-black/30">
            {columns.map((c) => (
              <th key={c} className="px-2 py-1 text-left font-medium">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/50 print:border-black/10">
              {r.map((v, j) => <td key={j} className="px-2 py-1 align-top">{v}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
