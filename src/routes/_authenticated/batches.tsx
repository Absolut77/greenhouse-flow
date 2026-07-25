import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/page-placeholder";

export const Route = createFileRoute("/_authenticated/batches")({
  head: () => ({ meta: [{ title: "Batches — ONO Cannabis" }] }),
  component: () => (
    <PagePlaceholder
      title="Batches"
      description="Gestion des batches de récolte, séchage et transformation."
    />
  ),
});
