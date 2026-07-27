import { createFileRoute, Link } from "@tanstack/react-router";
import { Users, Package, Settings as SettingsIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Paramètres — ONO Cannabis" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Paramètres</h1>
        <p className="text-sm text-muted-foreground">Administration et préférences.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isAdmin && (
          <Link to="/settings/users">
            <Card className="h-full transition-colors hover:border-primary/60">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Users className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-lg">Utilisateurs & rôles</CardTitle>
                </div>
                <CardDescription>Gérer les comptes, les rôles et l'activation.</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        )}
        <Link to="/settings/packaging">
          <Card className="h-full transition-colors hover:border-primary/60">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Package className="h-5 w-5" />
                </div>
                <CardTitle className="text-lg">Formats de packaging</CardTitle>
              </div>
              <CardDescription>
                Fleur et pré-roulés : nom, unités, poids, activation.
              </CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
        </Link>

        <Card className="h-full opacity-60">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <SettingsIcon className="h-5 w-5" />
              </div>
              <CardTitle className="text-lg">Préférences</CardTitle>
            </div>
            <CardDescription>À venir.</CardDescription>
          </CardHeader>
          <CardContent />
        </Card>
      </div>
    </div>
  );
}
