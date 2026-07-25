# Itération de finalisation ONO Cannabis

## 1. Inventaire & Rétention

- Migration : ajouter colonne `lot_kind` sur `inventory_lots` (`bulk` | `packaged` | `sample` | `retention`), défaut `bulk`.
- Contrainte trigger : bloquer tout `event_items.inventory_lot_id` référant un lot `retention` (SELECT/INSERT bloqué en amont via check RPC + guard UI).
- Le packaging final continue de créer **un seul lot par batch** (déjà en place) ; les échantillons créés pendant le Bulk Packaging deviennent lot `sample` (lié à la batch) ou `retention` (isolé, non lié à un flux).
- UI Inventaire : ajouter un filtre `kind` (Bulk / Packagé / Sample / Rétention) + badge distinct pour Rétention avec pastille "verrouillé".

## 2. Dashboard

- Nouveau bloc "Stock disponible total" = somme `quantity_grams` de tous les lots `status='available'`.
- Séparer les cartes Samples vs Rétention (deux compteurs distincts au lieu d'un seul "Samples").

## 3. Création de Batch

- Renommer le label du champ poids en « **Poids total de la récolte humide (g)** » dans `batches_.new.tsx` et fiche batch.
- Étape Curing : dans `curing-step.tsx`, validation bloquante — somme des poids d'entrée des conteneurs ≤ `batches.fresh_weight_grams`. Message clair au-dessus du bouton "Ajouter".

## 4. Événements — simplification et flux de clôture

- Réduire les types disponibles dans `events_.new.tsx` et filtres `events.tsx` à : **Packaging, Destruction, Rework**. (Réception/Expédition/B2B/Transfert/Échantillonnage retirés du sélecteur — les routes `/receptions/new` et `/shipments/new` restent la seule façon de créer ces événements techniques.)
- `EventItemsSection` :
  - Forcer `direction = out` (retirer le choix).
  - Afficher pour chaque lot sélectionnable : quantité g **et nombre de sacs disponibles** (via `packaging_bags` count).
  - Ajouter section "Détail du calcul" (unités × poids unitaire).
- **Clôture d'événement** (nouveau bouton "Clôturer l'événement" quand statut open) :
  - Champs : quantité réellement utilisée (g), unités produites (Master Case × unités × poids unitaire → calcul auto), destruction dry (g), notes.
  - Actions atomiques via nouvelle RPC `close_event(event_id, used_g, produced_lot_name, produced_g, produced_units, destroyed_g)` :
    1. Calcul surplus = sortie totale − used_g − destroyed_g → réinjecter dans lot source (`parent_lot_id`).
    2. Créer nouveau lot enfant `parent_lot_id = event source lot`, `batch_id = source.batch_id`, nom = nom de l'événement.
    3. Enregistrer destruction dry (`destructions` avec `phase='dry'`).
    4. Enregistrer processing loss (dans `events.processing_loss_grams` — nouvelle colonne).
    5. Passer event `status='closed'`.
  - UI : dialog `CloseEventDialog` avec récap complet et badges (Utilisé / Surplus retourné / Destruction dry / Loss).

## 5. Timbres d'accise

- Page `/stamps` : deux onglets (`Tabs` shadcn) :
  1. **Stock réel** (tableau actuel, avec calculs déjà dynamiques — vérifier affichage `depleted` bien visible en rouge/gris).
  2. **Packaging Runs** (nouveau) : liste des `stamp_movements` de type `used` joints à `events` + `excise_reels` + `inventory_lots` (lot produit). Colonnes : date, province, rouleau, événement, batch/lot, quantité timbres. Filtres : province, rouleau, batch, plage de dates.

## 6. Précision (détails calculs)

- Fiche inventaire lot packagé : afficher le calcul `N master cases × U unités × P g = Total g`.
- Fiche événement : afficher détail du calcul de clôture (déjà couvert §4).

## Détails techniques

**Migration SQL** (une seule migration) :
```sql
ALTER TABLE public.inventory_lots ADD COLUMN lot_kind text NOT NULL DEFAULT 'bulk'
  CHECK (lot_kind IN ('bulk','packaged','sample','retention'));
ALTER TABLE public.events ADD COLUMN processing_loss_grams numeric;
ALTER TABLE public.events ADD COLUMN dry_destroyed_grams numeric;

-- Trigger : bloquer event_items sur lot rétention
CREATE OR REPLACE FUNCTION public.block_retention_in_events() ...
CREATE TRIGGER ... BEFORE INSERT OR UPDATE ON event_items ...

-- RPC close_event(...)
```

**Fichiers touchés** :
- `src/routes/_authenticated/inventory.tsx` — filtre kind, badge rétention
- `src/routes/_authenticated/inventory_.$id.tsx` — affichage calcul
- `src/routes/_authenticated/dashboard.tsx` — stock total + split sample/rétention
- `src/routes/_authenticated/batches_.new.tsx` + `batches_.$id.tsx` — label poids humide
- `src/components/batches/steps/curing-step.tsx` — validation ≤ poids humide
- `src/routes/_authenticated/events_.new.tsx` + `events.tsx` — types réduits
- `src/components/events/event-items-section.tsx` — direction out, sacs dispo
- `src/routes/_authenticated/events_.$id.tsx` — bouton clôture + dialog
- Nouveau : `src/components/events/close-event-dialog.tsx`
- `src/routes/_authenticated/stamps.tsx` — tabs
- Nouveau : `src/components/stamps/packaging-runs-section.tsx`
- Packaging Bulk : les échantillons créés doivent poser `lot_kind` selon leur type

## Ordre d'exécution

1. Lancer la migration SQL (approbation utilisateur).
2. Après approbation, éditer tous les fichiers frontend en parallèle.
3. Vérifier avec `tsgo` puis screenshot Playwright des pages clés.

## Points non couverts (à confirmer si besoin)

- PDF de rapport de batch, photos Storage, rapports mensuels — reportés (P5–P7).