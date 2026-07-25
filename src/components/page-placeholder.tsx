import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PagePlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">À venir</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Cette section est prête à recevoir la logique métier. La structure de
          données et les permissions sont déjà en place côté serveur.
        </CardContent>
      </Card>
    </div>
  );
}
