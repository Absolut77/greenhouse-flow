
CREATE OR REPLACE FUNCTION public.apply_event_item_stock(
  _lot_id uuid,
  _direction text,
  _grams numeric,
  _units integer,
  _sign integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delta_g numeric := 0;
  delta_u integer := 0;
  cur_g numeric;
  cur_u integer;
  lot_num text;
BEGIN
  IF _lot_id IS NULL OR _direction IS NULL THEN
    RETURN;
  END IF;

  IF _direction = 'out' THEN
    delta_g := -COALESCE(_grams, 0) * _sign;
    delta_u := -COALESCE(_units, 0) * _sign;
  ELSIF _direction = 'in' THEN
    delta_g := COALESCE(_grams, 0) * _sign;
    delta_u := COALESCE(_units, 0) * _sign;
  ELSE
    RETURN;
  END IF;

  SELECT quantity_grams, units, lot_number
    INTO cur_g, cur_u, lot_num
  FROM public.inventory_lots
  WHERE id = _lot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lot introuvable';
  END IF;

  IF COALESCE(cur_g, 0) + delta_g < 0 THEN
    RAISE EXCEPTION 'Stock insuffisant pour le lot %: disponible %g, demandé %g',
      lot_num, COALESCE(cur_g, 0), -delta_g;
  END IF;

  IF COALESCE(cur_u, 0) + delta_u < 0 THEN
    RAISE EXCEPTION 'Unités insuffisantes pour le lot %: disponibles %, demandées %',
      lot_num, COALESCE(cur_u, 0), -delta_u;
  END IF;

  UPDATE public.inventory_lots
  SET quantity_grams = COALESCE(quantity_grams, 0) + delta_g,
      units = COALESCE(units, 0) + delta_u,
      updated_at = now()
  WHERE id = _lot_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.event_items_stock_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.apply_event_item_stock(
      NEW.inventory_lot_id, NEW.direction, NEW.quantity_grams, NEW.units, 1
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.apply_event_item_stock(
      OLD.inventory_lot_id, OLD.direction, OLD.quantity_grams, OLD.units, -1
    );
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Reverse old effect, then apply new
    PERFORM public.apply_event_item_stock(
      OLD.inventory_lot_id, OLD.direction, OLD.quantity_grams, OLD.units, -1
    );
    PERFORM public.apply_event_item_stock(
      NEW.inventory_lot_id, NEW.direction, NEW.quantity_grams, NEW.units, 1
    );
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS event_items_stock_sync ON public.event_items;
CREATE TRIGGER event_items_stock_sync
AFTER INSERT OR UPDATE OR DELETE ON public.event_items
FOR EACH ROW EXECUTE FUNCTION public.event_items_stock_trigger();
