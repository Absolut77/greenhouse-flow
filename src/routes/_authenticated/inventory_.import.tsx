import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { expandCartons, cartonTotals } from "@/components/inventory/carton-builder";
import { parseCartonFormula } from "@/lib/carton-formula";
import { fmtG } from "@/lib/containers";

export const Route = createFileRoute("/_authenticated/inventory_/import")({
  head: () => ({
    meta: [
      { title: "Import inventaire bulk — ONO Cannabis" },
      {
        name: "description",
        content:
          "Importer en masse des lots bulk historiques : batchs, lots, cartons et sacs à partir d'un JSON de formules.",
      },
      { property: "og:title", content: "Import inventaire bulk — ONO Cannabis" },
      {
        property: "og:description",
        content: "Import historique atomique des lots bulk (batch → lot → cartons → sacs).",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ImportBulkPage,
});

const SAMPLE = `[
  {
    "batch": "Batch0127",
    "strain": "Orange Slushie",
    "formula": "A: 7x1000 Bulk Medium\\nB: 3x1000 Bulk Trim, 1x726 Bulk HT"
  }
]`;

type Entry = { batch?: string; strain?: string; formula?: string; status?: string };

type Prepared = {
  batch: string;
  strain: string | null;
  status?: string;
  location: string;
  lot_number: string;
  cartons: {
    code: string;
    location: string;
    bags: ReturnType<typeof expandCartons>[number]["bags"];
  }[];
  bags: number;
  units: number;
  grams: number;
  errors: string[];
};

function ImportBulkPage() {
  const navigate = useNavigate();
  const { roles } = useAuth();
  const allowed = roles.some((r) => r === "admin" || r === "supervisor");

  const [raw, setRaw] = useState("");
  const [location, setLocation] = useState("Voute - 155");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const parsed = useMemo(() => {
    const text = raw.trim();
    if (!text) return { entries: [] as Prepared[], fatal: null as string | null };
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (e) {
      return { entries: [], fatal: `JSON invalide : ${(e as Error).message}` };
    }
    if (!Array.isArray(json)) return { entries: [], fatal: "Le JSON doit être un tableau." };

    const entries: Prepared[] = (json as Entry[]).map((e) => {
      const errors: string[] = [];
      const batch = (e.batch ?? "").trim();
      if (!batch) errors.push("numéro de batch manquant");
      const { cartons, errors: fErrors } = parseCartonFormula(e.formula ?? "");
      fErrors.forEach((f) => errors.push(`ligne ${f.line} : ${f.message}`));
      if (cartons.length === 0) errors.push("aucun carton reconnu dans la formule");

      const withLoc = cartons.map((c) => ({ ...c, location }));
      const expanded = expandCartons(withLoc);
      const totals = cartonTotals(withLoc);

      return {
        batch,
        strain: (e.strain ?? "").trim() || null,
        status: e.status,
        location,
        lot_number: batch,
        cartons: expanded.map((x) => ({
          code: x.carton.code,
          location,
          bags: x.bags,
        })),
        bags: totals.bags,
        units: totals.units,
        grams: totals.grams,
        errors,
      };
    });
    return { entries, fatal: null };
  }, [raw, location]);

  const totals = parsed.entries.reduce(
    (a, e) => ({ bags: a.bags + e.bags, grams: a.grams + e.grams }),
    { bags: 0, grams: 0 },
  );
  const invalid = parsed.entries.filter((e) => e.errors.length > 0);

  const run = async () => {
    if (parsed.entries.length === 0 || invalid.length > 0) return;
    setRunning(true);
    setResult(null);
    try {
      const payload = parsed.entries.map((e) => ({
        batch: e.batch,
        strain: e.strain,
        status: e.status,
        location: e.location,
        lot_number: e.lot_number,
        cartons: e.cartons,
      }));
      const { data, error } = await supabase.rpc("import_bulk_inventory", {
        _payload: payload as never,
      });
      if (error) throw error;
      const r = data as { batches_created: number; lots: number; bags: number };
      setResult(
        `${r.lots} lot(s) importé(s) · ${r.batches_created} batch(s) créée(s) · ${r.bags} sac(s).`,
      );
      toast.success("Import terminé");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/inventory">
            <ArrowLeft className="mr-1 h-4 w-4" /> Retour à l'inventaire
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Import historique — inventaire bulk</CardTitle>
          <CardDescription>
            Colle le JSON des batchs. Chaque entrée crée la batch si absente, puis (re)construit
            un lot bulk avec ses cartons et sacs. Opération atomique : tout ou rien.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {!allowed && (
            <p className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" /> Réservé aux administrateurs et superviseurs.
            </p>
          )}

          <div className="grid gap-2 sm:max-w-xs">
            <Label>Emplacement appliqué</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <Label>JSON des batchs</Label>
            <Textarea
              rows={12}
              className="font-mono text-xs"
              placeholder={SAMPLE}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Format : {`{ "batch": "Batch0127", "strain": "Orange Slushie", "formula": "A: 7x1000 Bulk Medium\\nB: 1x726 Bulk HT" }`}
            </p>
          </div>

          {parsed.fatal && <p className="text-sm text-destructive">{parsed.fatal}</p>}

          {parsed.entries.length > 0 && (
            <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-4">
              <p className="text-sm">
                Aperçu : <strong>{parsed.entries.length}</strong> lot(s) ·{" "}
                <strong>{totals.bags}</strong> sac(s) · <strong>{fmtG(totals.grams)} g</strong>
              </p>
              <div className="max-h-80 space-y-1 overflow-auto text-xs">
                {parsed.entries.map((e, i) => (
                  <div
                    key={`${e.batch}-${i}`}
                    className={`flex flex-wrap items-center gap-2 rounded border px-2 py-1 ${
                      e.errors.length > 0
                        ? "border-destructive/40 bg-destructive/10"
                        : "border-border/50"
                    }`}
                  >
                    <span className="font-medium">{e.batch || "—"}</span>
                    <span className="text-muted-foreground">{e.strain ?? ""}</span>
                    <span className="tabular-nums">
                      {e.cartons.length} carton(s) · {e.bags} sac(s) · {fmtG(e.grams)} g
                    </span>
                    {e.errors.map((err, k) => (
                      <span key={k} className="text-destructive">
                        {err}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
              {invalid.length > 0 && (
                <p className="text-sm text-destructive">
                  {invalid.length} entrée(s) en erreur — corrige-les avant de lancer l'import.
                </p>
              )}
            </div>
          )}

          {result && (
            <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
              {result}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => navigate({ to: "/inventory" })}>
              Fermer
            </Button>
            <Button
              onClick={run}
              disabled={
                !allowed || running || parsed.entries.length === 0 || invalid.length > 0
              }
            >
              {running ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-1 h-4 w-4" />
              )}
              Lancer l'import
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
