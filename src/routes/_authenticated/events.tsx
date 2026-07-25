import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/page-placeholder";

export const Route = createFileRoute("/_authenticated/events")({
  head: () => ({ meta: [{ title: "Événements — ONO Cannabis" }] }),
  component: () => (
    <PagePlaceholder
      title="Événements"
      description="Événements d'inventaire, destructions, transferts et ajustements."
    />
  ),
});
