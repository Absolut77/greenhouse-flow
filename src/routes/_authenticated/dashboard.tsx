import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Boxes, Package, CalendarClock, Stamp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Tableau de bord — ONO Cannabis" }] }),
  component: Dashboard,
});

const stats = [
  { label: "Batches actifs", value: "—", icon: Boxes },
  { label: "Lots d'inventaire", value: "—", icon: Package },
  { label: "Événements ouverts", value: "—", icon: CalendarClock },
  { label: "Bobines de timbres", value: "—", icon: Stamp },
];

function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tableau de bord</h1>
        <p className="text-sm text-muted-foreground">
          Vue d'ensemble des opérations post-récolte.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {s.label}
              </CardTitle>
              <s.icon className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Activité récente</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Aucune activité pour l'instant.
        </CardContent>
      </Card>
    </div>
  );
}
