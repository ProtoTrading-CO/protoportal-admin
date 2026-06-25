-- Auto-approve self-service trade registrations (main portal apply / register forms).
-- Requires company + delivery address (trade signup), not bare admin-created accounts.

CREATE OR REPLACE FUNCTION public.allocate_customer_code_sql()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  attempt int;
  i int;
BEGIN
  FOR attempt IN 1..80 LOOP
    code := '';
    FOR i IN 1..6 LOOP
      code := code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    END LOOP;
    IF NOT EXISTS (
      SELECT 1 FROM public.customers WHERE upper(customer_code) = upper(code)
    ) THEN
      RETURN code;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'Could not allocate a unique customer code';
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_approve_trade_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  preferred text;
BEGIN
  IF NEW.role IS DISTINCT FROM 'customer' THEN
    RETURN NEW;
  END IF;

  IF NEW.is_approved IS TRUE THEN
    RETURN NEW;
  END IF;

  -- Trade self-registration: full address captured on signup forms
  IF coalesce(trim(NEW.company_address), '') = ''
     OR coalesce(trim(NEW.delivery_address), '') = '' THEN
    RETURN NEW;
  END IF;

  preferred := upper(coalesce(trim(NEW.customer_code), ''));
  IF preferred ~ '^[A-Z0-9]{6}$'
     AND NOT EXISTS (SELECT 1 FROM public.customers WHERE upper(customer_code) = preferred AND id <> NEW.id) THEN
    NEW.customer_code := preferred;
  ELSIF coalesce(trim(NEW.customer_code), '') = '' THEN
    NEW.customer_code := public.allocate_customer_code_sql();
  END IF;

  NEW.is_approved := true;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_approve_trade_signup ON public.customers;
CREATE TRIGGER trg_auto_approve_trade_signup
  BEFORE INSERT OR UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_approve_trade_signup();
