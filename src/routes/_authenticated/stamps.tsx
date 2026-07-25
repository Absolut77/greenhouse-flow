import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/page-placeholder";

export const Route = createFileRoute("/_authenticated/stamps")({
  head: () => ({ meta: [{ title: "Timbres d'accise — ONO Cannabis" }] }),
  component: () => (
    <PagePlaceholder
      title="Timbres d'accise"
      description="Bobines de timbres provinciaux et mouvements associés."
    />
  ),
});
