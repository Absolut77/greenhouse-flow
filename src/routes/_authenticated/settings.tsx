import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/page-placeholder";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Paramètres — ONO Cannabis" }] }),
  component: () => (
    <PagePlaceholder
      title="Paramètres"
      description="Utilisateurs, rôles, formats d'emballage et préférences."
    />
  ),
});
