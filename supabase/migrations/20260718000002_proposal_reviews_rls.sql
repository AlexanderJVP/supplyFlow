-- proposal_reviews has RLS enabled (20260716000000_initial.sql) but was
-- never given a policy, so every access -- including from review_proposal's
-- own INSERT, running as the authenticated user -- was silently denied
-- ("new row violates row-level security policy"). The table has no
-- tenant_id of its own; it's scoped through its parent proposal instead.
create policy tenant_isolation_proposal_reviews on proposal_reviews
  using (
    exists (
      select 1 from proposals
      where proposals.id = proposal_reviews.proposal_id
        and proposals.tenant_id = current_tenant_id()
    )
  )
  with check (
    exists (
      select 1 from proposals
      where proposals.id = proposal_reviews.proposal_id
        and proposals.tenant_id = current_tenant_id()
    )
  );
