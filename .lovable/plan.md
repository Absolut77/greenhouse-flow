# Plan — P1 Dashboard fonctionnel + P2 Module Réception

## P1 — Dashboard réellement fonctionnel

### Cartes indicateurs (remplacement)
Grille passe de 5 à 6-7 cartes, toutes cliquables vers la vue filtrée correspondante :

- **Batches en cours** → `/batches?status=in_progress`
- **Bulk (flower + trim)** en g → `/inventory?type=bulk` (somme `inventory_lots.quantity_grams` où `status=available` et `product_type ∈ {flower, trim}`)
- **Packagé en stock (avec timbres)** en unités + grammes → `/inventory?type=packaged` (lots `product_type=preroll` OU `parent_lot_id NOT NULL`, `status=available`)
- **Samples / Rétention** en g → `/inventory?type=sample` (lots `product_type=sample` + table `samples` non détruits, agrégé)
- **Événements ouverts** → `/events?status=open`
- **Timbres disponibles** (somme balances des rouleaux `available`) → `/stamps?status=available`

Chaque carte : valeur dynamique via `Promise.all` d’agrégats Supabase, skeleton pendant chargement, `Link` qui pousse la searchParam appropriée.

### Filtres URL sur les pages cibles
Ajouter `validateSearch` sur `/inventory` et `/stamps` pour lire `type`/`status` depuis l’URL (déjà présent sur `/batches` via state — on branche state initial sur `Route.useSearch`). Sur `/inventory`, ajouter un mode `type=bulk|packaged|sample` qui applique les mêmes filtres que le calcul dashboard, pour que la carte et la page listent la même chose.

### Alertes
Conserver : timbres bas (<500), batches ouvertes depuis >14 jours. Ajouter : événements `open` depuis >7 jours.

### Activité récente
Inchangé (déjà filtrée par rôle admin/supervisor).

### Fichiers touchés
- `src/routes/_authenticated/dashboard.tsx` — refonte requêtes + cartes + liens
- `src/routes/_authenticated/inventory.tsx` — `validateSearch`, groupe `type` bulk/packaged/sample, initial filters depuis URL
- `src/routes/_authenticated/stamps.tsx` — `validateSearch` sur `status`
- `src/routes/_authenticated/batches.tsx` — `validateSearch` sur `status`
- `src/routes/_authenticated/events.tsx` — `validateSearch` sur `status`

## P2 — Module Réception

### Modèle de données
Nouveau type d’événement `reception` (déjà supportable via `events.event_type`, on ajoute la valeur dans `EVENT_TYPES`). Pour couvrir les 3 sous-cas de manière propre, migration ajoutant à `events` :

- `reception_kind text` — `cannabis_bulk | cannabis_batch | non_cannabis | transformation_return`
- `supplier text` — producteur d’origine / fournisseur / transformateur (Nuance, etc.)
- `reference_number text` — bordereau, PO, manifest
- `linked_shipment_event_id uuid REFERENCES events(id)` — pour les retours de transformation (permet le calcul d’écart envoyé vs reçu)

Nouvelle table `non_cannabis_receptions` (léger, produits/matériel non-cannabis qui ne rentrent pas dans `inventory_lots`) :
```
id, event_id (FK events), item_name, category, quantity, unit, location, notes, created_at
```
Avec GRANT + RLS (authenticated read/write, service_role all).

Pas de nouvelle table pour cannabis : on réutilise `inventory_lots` (création ou append) avec `direction='in'` dans `event_items`. Les triggers existants `event_items_stock_trigger` gèrent déjà l’ajustement de stock automatiquement.

### UI

**Page liste** — les réceptions apparaissent naturellement dans `/events` filtré `event_type=reception`. Un bouton “Nouvelle réception” sur `/events` pointe directement vers le formulaire dédié.

**Nouvelle route** `src/routes/_authenticated/receptions_.new.tsx` : formulaire multi-étapes simple :

1. **Type** : Cannabis bulk / Cannabis batch entière / Non-cannabis / Retour de transformation
2. **Infos communes** : date, fournisseur, référence, notes
3. Selon type :
   - **Cannabis bulk** : batch existante (dropdown) OU créer nouveau lot → produit, format, grammes, unités, emplacement
   - **Cannabis batch** : crée une nouvelle batch (numéro auto) + lot associé
   - **Non-cannabis** : liste d’items (nom, catégorie, quantité, unité, emplacement)
   - **Retour de transformation** : sélection de l’événement `shipment` d’origine (filtré `event_type ∈ {shipment, transfer}`) → affiche quantités envoyées → saisie quantités reçues → calcul écart affiché en temps réel, création `event_items` `direction='in'` sur les mêmes lots (ou nouveaux si transformé)

Submit : crée l’`event` (status=`completed` si tout est là, `open` sinon), les `event_items` associés, et éventuellement le/les `inventory_lots` ou lignes `non_cannabis_receptions`.

**Fiche réception** — réutilise `events_.$id.tsx` avec section conditionnelle affichant :
- Détails réception (fournisseur, kind, référence)
- Section non-cannabis items (si applicable)
- Section écart envoyé/reçu (si `linked_shipment_event_id`)

### Fichiers touchés
- `supabase/migrations` — nouvelle migration `events` colonnes + `non_cannabis_receptions`
- `src/routes/_authenticated/events.tsx` — ajouter `reception` dans `EVENT_TYPES` + bouton “Nouvelle réception”
- `src/routes/_authenticated/receptions_.new.tsx` — nouveau formulaire dédié
- `src/routes/_authenticated/events_.$id.tsx` — sections conditionnelles réception + écart
- `src/components/events/reception-details-section.tsx` — nouveau composant
- `src/components/events/shipment-variance-section.tsx` — nouveau composant

## Détails techniques

- Les cartes dashboard font 6 requêtes agrégées en parallèle (`Promise.all`) ; pas de N+1.
- `validateSearch` avec Zod pour typer proprement les filtres URL.
- Réception cannabis : réutilise 100% le pipeline stock existant (`event_items` direction=`in` → trigger SQL ajuste `inventory_lots`), donc aucun risque de désync.
- Retour de transformation : on charge les `event_items` `direction='out'` de l’événement lié pour pré-remplir le formulaire et calculer les écarts côté client (pas de calcul en base — juste affichage).
- Numérotation événement réception : suit le pattern existant `EV-YYYY-####` géré côté formulaire.
- Design : composants shadcn existants, thème sombre respecté.

## Ordre d’exécution
1. Migration SQL (ajout colonnes events + table non_cannabis_receptions + GRANT/RLS)
2. Refonte dashboard + filtres URL sur inventory/stamps/batches/events
3. Route + formulaire `receptions_.new.tsx`
4. Sections réception dans `events_.$id.tsx`
5. Vérif typecheck + smoke test navigation

Rapport final structuré fourni à la fin.
