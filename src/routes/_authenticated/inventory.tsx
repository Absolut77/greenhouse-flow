import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/page-placeholder";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({ meta: [{ title: "Inventaire — ONO Cannabis" }] }),
  component: () => (
    <PagePlaceholder
      title="Inventaire"
      description="Lots de produit, formats, emplacements et statuts."
    />
  ),
});
