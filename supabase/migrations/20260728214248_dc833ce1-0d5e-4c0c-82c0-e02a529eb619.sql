-- Normalise les formats fleur valides
UPDATE public.packaging_formats SET name = '1 g', units_per_pack = 1, unit_weight_grams = 1, net_weight_grams = 1, sort_order = 5, is_active = true
  WHERE id = 'e7a84236-73f3-409c-b49c-1d00a0a62a46';
UPDATE public.packaging_formats SET name = '3,5 g', units_per_pack = 1, unit_weight_grams = 3.5, net_weight_grams = 3.5, sort_order = 10, is_active = true
  WHERE id = '44eb07f5-017a-4f4b-ba24-0ff75e14885e';
UPDATE public.packaging_formats SET name = '7 g', units_per_pack = 1, unit_weight_grams = 7, net_weight_grams = 7, sort_order = 20, is_active = true
  WHERE id = '2abf1b88-cff1-49fb-953b-97d247096d67';
UPDATE public.packaging_formats SET name = '14 g', units_per_pack = 1, unit_weight_grams = 14, net_weight_grams = 14, sort_order = 30, is_active = true
  WHERE id = '6e659b89-36b9-4728-baf5-a264d4eb47d7';
UPDATE public.packaging_formats SET name = '28 g', units_per_pack = 1, unit_weight_grams = 28, net_weight_grams = 28, sort_order = 40, is_active = true
  WHERE id = '64f886da-ad91-4ccf-b582-8617c5b8c10b';

-- Formats pré-roulés : uniquement 0,5 g et 0,35 g (poids unitaire)
UPDATE public.packaging_formats SET name = '0,5 g', units_per_pack = 1, unit_weight_grams = 0.5, net_weight_grams = 0.5, sort_order = 50, is_active = true
  WHERE id = 'e8948786-8f15-4f1a-97a3-a1b1261102c3';
UPDATE public.packaging_formats SET name = '0,35 g', units_per_pack = 1, unit_weight_grams = 0.35, net_weight_grams = 0.35, sort_order = 60, is_active = true
  WHERE id = '3fcb2f20-8bea-40fd-ae6e-157a2f17a66d';

-- Désactive tous les autres formats (doublons historiques, poids unitaire nul)
UPDATE public.packaging_formats SET is_active = false
WHERE id NOT IN (
  'e7a84236-73f3-409c-b49c-1d00a0a62a46',
  '44eb07f5-017a-4f4b-ba24-0ff75e14885e',
  '2abf1b88-cff1-49fb-953b-97d247096d67',
  '6e659b89-36b9-4728-baf5-a264d4eb47d7',
  '64f886da-ad91-4ccf-b582-8617c5b8c10b',
  'e8948786-8f15-4f1a-97a3-a1b1261102c3',
  '3fcb2f20-8bea-40fd-ae6e-157a2f17a66d'
);