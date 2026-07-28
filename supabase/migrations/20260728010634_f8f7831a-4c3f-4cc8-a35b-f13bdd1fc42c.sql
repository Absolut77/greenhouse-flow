CREATE OR REPLACE FUNCTION public.import_bulk_inventory(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  entry jsonb;
  carton jsonb;
  bag jsonb;
  v_batch_id uuid;
  v_lot_id uuid;
  v_carton_id uuid;
  v_batch_number text;
  v_strain text;
  v_location text;
  v_lot_number text;
  v_uid uuid := auth.uid();
  v_grams numeric;
  v_units integer;
  v_created_batches integer := 0;
  v_lots integer := 0;
  v_bags integer := 0;
  results jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.has_any_role(v_uid, ARRAY['admin','supervisor']::app_role[]) THEN
    RAISE EXCEPTION 'Permission refusée' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _payload IS NULL OR jsonb_typeof(_payload) <> 'array' THEN
    RAISE EXCEPTION 'Payload invalide : un tableau JSON est attendu.';
  END IF;

  FOR entry IN SELECT * FROM jsonb_array_elements(_payload)
  LOOP
    v_batch_number := NULLIF(trim(entry->>'batch'), '');
    v_strain := NULLIF(trim(entry->>'strain'), '');
    v_location := COALESCE(NULLIF(trim(entry->>'location'), ''), 'Voute - 155');
    v_lot_number := COALESCE(NULLIF(trim(entry->>'lot_number'), ''), v_batch_number);

    IF v_batch_number IS NULL THEN
      RAISE EXCEPTION 'Entrée sans numéro de batch.';
    END IF;

    -- 1) Batch
    SELECT id INTO v_batch_id FROM public.batches WHERE batch_number = v_batch_number;
    IF v_batch_id IS NULL THEN
      INSERT INTO public.batches (batch_number, strain, status, created_by)
      VALUES (v_batch_number, v_strain, COALESCE(NULLIF(entry->>'status',''), 'closed'), v_uid)
      RETURNING id INTO v_batch_id;
      v_created_batches := v_created_batches + 1;
    ELSIF v_strain IS NOT NULL THEN
      UPDATE public.batches SET strain = COALESCE(strain, v_strain) WHERE id = v_batch_id;
    END IF;

    -- 2) Lot bulk (jamais un lot de rétention)
    SELECT id INTO v_lot_id
      FROM public.inventory_lots
     WHERE lot_number = v_lot_number AND lot_kind <> 'retention';

    IF v_lot_id IS NULL THEN
      INSERT INTO public.inventory_lots (
        lot_number, batch_id, product_type, format, quantity_grams, units,
        location, status, lot_kind, notes
      ) VALUES (
        v_lot_number, v_batch_id, 'bulk', 'bulk', 0, 0,
        v_location, 'available', 'bulk',
        CASE WHEN v_strain IS NOT NULL THEN 'Variété : ' || v_strain ELSE NULL END
      ) RETURNING id INTO v_lot_id;
    ELSE
      UPDATE public.inventory_lots
         SET batch_id = v_batch_id,
             location = v_location,
             lot_kind = 'bulk',
             product_type = COALESCE(product_type, 'bulk'),
             notes = COALESCE(notes, CASE WHEN v_strain IS NOT NULL THEN 'Variété : ' || v_strain ELSE NULL END)
       WHERE id = v_lot_id;

      -- Reconstruction : refus si un sac a déjà bougé
      IF EXISTS (
        SELECT 1 FROM public.stock_containers c
         WHERE c.lot_id = v_lot_id
           AND (c.status <> 'available' OR c.container_type = 'retention'
                OR EXISTS (SELECT 1 FROM public.event_items ei WHERE ei.container_id = c.id))
      ) THEN
        RAISE EXCEPTION 'Lot % : des sacs sont déjà mouvementés ou en rétention, import annulé.', v_lot_number;
      END IF;

      DELETE FROM public.stock_containers WHERE lot_id = v_lot_id;
      DELETE FROM public.stock_cartons WHERE lot_id = v_lot_id;
    END IF;

    -- 3) Cartons + sacs
    FOR carton IN SELECT * FROM jsonb_array_elements(COALESCE(entry->'cartons', '[]'::jsonb))
    LOOP
      INSERT INTO public.stock_cartons (lot_id, carton_code, location, created_by)
      VALUES (v_lot_id, COALESCE(NULLIF(carton->>'code',''), 'A'),
              COALESCE(NULLIF(carton->>'location',''), v_location), v_uid)
      RETURNING id INTO v_carton_id;

      FOR bag IN SELECT * FROM jsonb_array_elements(COALESCE(carton->'bags', '[]'::jsonb))
      LOOP
        IF COALESCE(bag->>'container_type','bulk') = 'retention' THEN
          RAISE EXCEPTION 'Les sacs de rétention ne peuvent pas être importés.';
        END IF;
        INSERT INTO public.stock_containers (
          lot_id, carton_id, container_code, container_type, unit_count,
          unit_weight_grams, net_weight_grams, gross_weight_grams,
          location, status, notes, created_by
        ) VALUES (
          v_lot_id, v_carton_id,
          COALESCE(NULLIF(bag->>'container_code',''), 'X'),
          COALESCE(NULLIF(bag->>'container_type',''), 'bulk'),
          COALESCE((bag->>'unit_count')::integer, 1),
          COALESCE((bag->>'unit_weight_grams')::numeric, 0),
          COALESCE((bag->>'net_weight_grams')::numeric, 0),
          NULLIF(bag->>'gross_weight_grams','')::numeric,
          COALESCE(NULLIF(bag->>'location',''), v_location),
          'available',
          NULLIF(bag->>'notes',''),
          v_uid
        );
        v_bags := v_bags + 1;
      END LOOP;
    END LOOP;

    -- 4) Totaux du lot
    SELECT COALESCE(SUM(net_weight_grams),0), COALESCE(SUM(unit_count),0)::integer
      INTO v_grams, v_units
      FROM public.stock_containers
     WHERE lot_id = v_lot_id AND status = 'available';

    UPDATE public.inventory_lots
       SET quantity_grams = v_grams, units = v_units
     WHERE id = v_lot_id;

    v_lots := v_lots + 1;
    results := results || jsonb_build_object(
      'batch', v_batch_number, 'lot_id', v_lot_id, 'grams', v_grams, 'units', v_units
    );
  END LOOP;

  RETURN jsonb_build_object(
    'batches_created', v_created_batches,
    'lots', v_lots,
    'bags', v_bags,
    'details', results
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_bulk_inventory(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_bulk_inventory(jsonb) TO authenticated;