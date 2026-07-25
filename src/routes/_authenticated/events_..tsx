
function ReceptionDetailsSection({ event }: { event: Event }) {
  const [items, setItems] = useState<Tables<"non_cannabis_receptions">[] | null>(null);
  const [linkedShipment, setLinkedShipment] = useState<Event | null>(null);
  const kindLabel = RECEPTION_KINDS.find((k) => k.value === event.reception_kind)?.label
    ?? event.reception_kind
    ?? "—";

  useEffect(() => {
    if (event.reception_kind === "non_cannabis") {
      (async () => {
        const { data } = await supabase
          .from("non_cannabis_receptions")
          .select("*")
          .eq("event_id", event.id)
          .order("created_at", { ascending: true });
        setItems(data ?? []);
      })();
    }
    if (event.linked_shipment_event_id) {
      (async () => {
        const { data } = await supabase
          .from("events")
          .select("*")
          .eq("id", event.linked_shipment_event_id!)
          .maybeSingle();
        setLinkedShipment(data ?? null);
      })();
    }
  }, [event.id, event.reception_kind, event.linked_shipment_event_id]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Détails de la réception</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Info label="Type de réception">{kindLabel}</Info>
        <Info label="Fournisseur">{event.supplier ?? "—"}</Info>
        <Info label="Référence">{event.reference_number ?? "—"}</Info>
        <Info label="Expédition liée">
          {linkedShipment ? (
            <Link
              to="/events/$id"
              params={{ id: linkedShipment.id }}
              className="hover:underline text-primary"
            >
              {linkedShipment.event_number}
            </Link>
          ) : (
            "—"
          )}
        </Info>
        {event.reception_kind === "non_cannabis" && (
          <div className="sm:col-span-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              Articles reçus
            </p>
            {items === null ? (
              <p className="text-sm text-muted-foreground">Chargement…</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun article.</p>
            ) : (
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2">Nom</th>
                      <th className="text-left px-3 py-2">Catégorie</th>
                      <th className="text-right px-3 py-2">Qté</th>
                      <th className="text-left px-3 py-2">Unité</th>
                      <th className="text-left px-3 py-2">Emplacement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.id} className="border-t border-border">
                        <td className="px-3 py-2">{it.item_name}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {it.category ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right">{it.quantity ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {it.unit ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {it.location ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
