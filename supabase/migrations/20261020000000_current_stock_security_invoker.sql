-- STORY-074: current_stock was created as a plain view, which runs with its
-- owner's privileges -- so stock_ledger's tenant_isolation policy never
-- applied to it, and anyone holding the public anon key could read every
-- tenant's stock straight from PostgREST (/rest/v1/current_stock). Our API
-- always filters on tenant_id, so the app itself never leaked; direct
-- access did. security_invoker makes the view run as the querying role, so
-- RLS on stock_ledger applies again. Every future view needs this too.
alter view current_stock set (security_invoker = true);
