
# Workflow progressif de la fiche Batch

Transformer `/batches/:id` en un parcours guidé étape par étape avec déblocage strict, question de destruction entre chaque étape, et clôture automatique à la fin.

## Modèle de données

### Réutilisation de `batch_stages`
Les étapes du workflow sont matérialisées comme des lignes `batch_stages` avec `stage_type` normalisé :
- `drying` → Séchage
- `debudding_manual` → Debudage manuel (nouveau code)
- `mobius` → Mobius
- `sanitation` → Sanitation (indépendante)
- `sorting_weighing` → Tri & Pesée principale (nouveau code)
- `curing` → Curing
- `bulk_packaging` → Bulk Packaging

Ajout de colonnes sur `batch_stages` :
- `status` text (`locked` | `in_progress` | `on_hold` | `done`), défaut `locked`
- `metadata` jsonb (paramètres spécifiques : type debudage, nb personnes, temps, réglages Mobius inclinaison/tumbler/lames/aspiration, commentaires)

### Nouvelle table `destructions`
```
id uuid PK
batch_id uuid FK batches
stage_id uuid FK batch_stages (nullable pour Curing)
weight_grams numeric
person_count int
sanitation_products text
duration_minutes int
comments text
photos text[] (URLs — bucket optionnel plus tard)
created_at, updated_at, created_by
```
RLS : lecture pour tous les rôles authentifiés, écriture bloquée pour `viewer`. Trigger d'audit branché.

## Logique de progression

Helper `computeWorkflow(stages)` côté client qui, à partir des rows `batch_stages`, calcule pour chaque étape du workflow son état :
- `locked` (prérequis pas `done`)
- `available` (prérequis OK, pas encore démarrée)
- `in_progress` / `on_hold` / `done` (depuis la ligne)

Règles de déblocage :
- Création → Séchage disponible
- Séchage `done` → Debudage (Manuel + Mobius) disponibles en parallèle
- Debudage manuel `done` ET Mobius `done` → Tri & Pesée disponible
- Tri & Pesée `done` → Curing disponible
- Curing `done` → Bulk Packaging disponible
- Bulk Packaging `done` → `UPDATE batches SET status = 'closed', closed_at = now()`
- Sanitation : toujours disponible dès la création, ne bloque rien

Actions : « Démarrer », « Terminer cette étape », « Mettre en standby » (Sanitation uniquement).

Après un « Terminer » (sauf Curing et Sanitation) → ouverture du `DestructionPromptDialog` : « Y a-t-il eu de la destruction durant cette étape ? Oui / Non ». Oui → `DestructionFormDialog` pré-rempli avec `stage_id`.

## UI

Remplacer `StagesSection` actuel par un composant `WorkflowTimeline` :
- Timeline verticale (barre + puces) dans l'ordre listé
- Chaque étape : icône d'état (🔒 gris, 🟡 ambre, ✅ vert), titre, dates début/fin, bouton d'action contextuel
- Debudage rendu comme carte contenant deux sous-cartes côte à côte (Manuel / Mobius), chacune avec son propre formulaire de démarrage/fin et ses champs spécifiques
- Sanitation affichée dans un encart séparé « Étape indépendante » avec bouton Standby
- Bloc « Destructions » listant toutes les destructions groupées par étape, avec bouton d'ajout manuel

Conservation des sections existantes `DryingLogsSection`, `SamplesSection`, `WeightsSection` : elles restent affichées sous la timeline (elles alimentent séchage / pesées).

Nouveaux fichiers :
- `src/components/batches/workflow-timeline.tsx`
- `src/components/batches/workflow-step-card.tsx`
- `src/components/batches/debudding-section.tsx` (Manuel + Mobius)
- `src/components/batches/destruction-prompt-dialog.tsx`
- `src/components/batches/destruction-form-dialog.tsx`
- `src/components/batches/destructions-section.tsx`
- `src/lib/batch-workflow.ts` (helper de calcul d'état)

`batches_.$id.tsx` : remplacer `<StagesSection />` par `<WorkflowTimeline />` + `<DestructionsSection />` ; garder les autres sections.

## Migration SQL (une seule)
1. `ALTER TABLE public.batch_stages ADD COLUMN status text NOT NULL DEFAULT 'locked'`, `ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb`
2. `CREATE TABLE public.destructions (...)` + GRANT authenticated/service_role + ENABLE RLS + policies (SELECT auth ; INSERT/UPDATE/DELETE si role != viewer via `has_any_role`)
3. Trigger `update_updated_at` sur `destructions`
4. Trigger `write_audit_log` sur `destructions`

## Rétro-compatibilité
- Les anciennes lignes `batch_stages` avec `stage_type = 'debudding'` restent lisibles ; le helper les traite comme équivalent `debudding_manual` en lecture seule.
- Pas de suppression de colonnes existantes.

## Points d'attention
- Types Supabase régénérés après migration → code qui lit `status`/`metadata` doit venir après.
- Le stockage photos n'est pas activé (pas de bucket) — champ `photos` gardé pour plus tard, UI upload désactivée dans un premier temps (juste champ URL/note).
- L'audit trigger existant sur `batch_stages` continue de logger les changements de statut.
