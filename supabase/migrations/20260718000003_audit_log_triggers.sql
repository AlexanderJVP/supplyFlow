-- Security Rule 8 says "use the DB trigger pattern, don't rely on application
-- code to remember" -- but every RPC shipped so far (complete_production_order,
-- apply_bom_change_payload, submit_proposal, review_proposal) wrote to
-- audit_logs manually instead, and items/bom_lines direct mutations (POST/PATCH)
-- weren't audited at all. This migration adds a single generic trigger and
-- attaches it to every actively-mutated business table, then strips the
-- now-redundant manual inserts out of the existing RPCs so nothing double-logs.
--
-- Deliberately NOT attached to: stock_ledger (it IS the audit trail for stock
-- movements -- logging it into audit_logs too would just be redundant
-- bookkeeping of the same fact), proposal_reviews (same reasoning -- it's
-- already an append-only record of who reviewed what and when; that table
-- has no tenant_id of its own either, see 20260718000002_proposal_reviews_rls.sql),
-- and tenants/workflow_steps (admin bootstrapping config, low churn, created
-- via the service-role client where auth.uid() is null anyway). roles/profiles
-- are included now even though nothing mutates them yet, so the upcoming
-- invite-user/manage-roles feature gets audit coverage for free instead of
-- needing its own manual inserts.
--
-- Net behavior change worth knowing: review_proposal's "still pending_review,
-- waiting on the next step" branch no longer writes an audit_logs row (the
-- old manual code logged a no-op "UPDATE" there with old_data always null,
-- which wasn't informative anyway). Each review decision is still fully
-- captured in proposal_reviews; only the final state-changing update per
-- proposal (submitted / approved / rejected / sent back to draft) is audited.
create or replace function log_audit_event()
returns trigger
language plpgsql
as $$
declare
  v_tenant_id uuid;
  v_record_id uuid;
begin
  if tg_op = 'DELETE' then
    v_tenant_id := old.tenant_id;
    v_record_id := old.id;
  else
    v_tenant_id := new.tenant_id;
    v_record_id := new.id;
  end if;

  insert into audit_logs (tenant_id, table_name, record_id, action, old_data, new_data, user_id)
  values (
    v_tenant_id,
    tg_table_name,
    v_record_id,
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    auth.uid()
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_items on items;
create trigger audit_items
  after insert or update or delete on items
  for each row execute function log_audit_event();

drop trigger if exists audit_bom_lines on bom_lines;
create trigger audit_bom_lines
  after insert or update or delete on bom_lines
  for each row execute function log_audit_event();

drop trigger if exists audit_production_orders on production_orders;
create trigger audit_production_orders
  after insert or update or delete on production_orders
  for each row execute function log_audit_event();

drop trigger if exists audit_proposals on proposals;
create trigger audit_proposals
  after insert or update or delete on proposals
  for each row execute function log_audit_event();

drop trigger if exists audit_roles on roles;
create trigger audit_roles
  after insert or update or delete on roles
  for each row execute function log_audit_event();

drop trigger if exists audit_profiles on profiles;
create trigger audit_profiles
  after insert or update or delete on profiles
  for each row execute function log_audit_event();

-- Strip the now-redundant manual audit_logs inserts out of the existing RPCs
-- (the triggers above fire automatically within the same transaction).

create or replace function complete_production_order(
  p_production_order_id uuid,
  p_tenant_id uuid,
  p_user_id uuid
)
returns production_orders
language plpgsql
as $$
declare
  v_order production_orders%rowtype;
  v_component record;
begin
  select * into v_order
  from production_orders
  where id = p_production_order_id and tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'Production order not found';
  end if;

  if v_order.status = 'completed' then
    raise exception 'Production order is already completed';
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'Cannot complete a cancelled production order';
  end if;

  for v_component in
    select * from can_produce(v_order.item_id, v_order.quantity, p_tenant_id)
  loop
    if v_component.shortfall > 0 then
      raise exception 'Insufficient stock for component %: required %, available %',
        v_component.item_id, v_component.required, v_component.available;
    end if;

    insert into stock_ledger (
      tenant_id, item_id, quantity_delta, reason, reference_type, reference_id, user_id
    ) values (
      p_tenant_id, v_component.item_id, -v_component.required, 'consumed',
      'production_order', p_production_order_id, p_user_id
    );
  end loop;

  insert into stock_ledger (
    tenant_id, item_id, quantity_delta, reason, reference_type, reference_id, user_id
  ) values (
    p_tenant_id, v_order.item_id, v_order.quantity, 'produced',
    'production_order', p_production_order_id, p_user_id
  );

  update production_orders
  set status = 'completed', completed_at = now(), updated_at = now()
  where id = p_production_order_id
  returning * into v_order;

  return v_order;
end;
$$;

create or replace function apply_bom_change_payload(
  p_tenant_id uuid,
  p_payload jsonb,
  p_user_id uuid
)
returns void
language plpgsql
as $$
declare
  v_create record;
  v_update record;
  v_delete_id uuid;
begin
  for v_create in
    select * from jsonb_to_recordset(coalesce(p_payload->'create', '[]'::jsonb))
      as x(parent_item_id uuid, child_item_id uuid, quantity numeric, notes text)
  loop
    insert into bom_lines (tenant_id, parent_item_id, child_item_id, quantity, notes)
    values (p_tenant_id, v_create.parent_item_id, v_create.child_item_id, v_create.quantity, v_create.notes);
  end loop;

  for v_update in
    select * from jsonb_to_recordset(coalesce(p_payload->'update', '[]'::jsonb))
      as x(id uuid, quantity numeric, notes text)
  loop
    update bom_lines
    set quantity = coalesce(v_update.quantity, quantity),
        notes = coalesce(v_update.notes, notes)
    where id = v_update.id and tenant_id = p_tenant_id;

    if not found then
      raise exception 'BOM line % not found for tenant', v_update.id;
    end if;
  end loop;

  for v_delete_id in
    select value::uuid from jsonb_array_elements_text(coalesce(p_payload->'delete', '[]'::jsonb)) as value
  loop
    delete from bom_lines where id = v_delete_id and tenant_id = p_tenant_id;
    if not found then
      raise exception 'BOM line % not found for tenant', v_delete_id;
    end if;
  end loop;
end;
$$;

create or replace function submit_proposal(
  p_proposal_id uuid,
  p_tenant_id uuid,
  p_user_id uuid
)
returns proposals
language plpgsql
as $$
declare
  v_proposal proposals%rowtype;
begin
  select * into v_proposal
  from proposals
  where id = p_proposal_id and tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'Proposal not found';
  end if;

  if v_proposal.created_by != p_user_id then
    raise exception 'Only the proposal creator can submit it';
  end if;

  if v_proposal.status != 'draft' then
    raise exception 'Only draft proposals can be submitted';
  end if;

  if not exists (
    select 1 from workflow_steps
    where tenant_id = p_tenant_id and proposal_type = v_proposal.type
  ) then
    raise exception 'No workflow steps configured for proposal type %', v_proposal.type;
  end if;

  update proposals set status = 'pending_review', updated_at = now()
  where id = p_proposal_id
  returning * into v_proposal;

  return v_proposal;
end;
$$;

create or replace function review_proposal(
  p_proposal_id uuid,
  p_tenant_id uuid,
  p_reviewer_id uuid,
  p_action text,
  p_notes text
)
returns proposals
language plpgsql
as $$
declare
  v_proposal proposals%rowtype;
  v_reviewer_role uuid;
  v_step_order int;
  v_required_role uuid;
  v_has_next boolean;
begin
  if p_action not in ('approved', 'rejected', 'requested_changes') then
    raise exception 'Invalid review action: %', p_action;
  end if;

  select * into v_proposal
  from proposals
  where id = p_proposal_id and tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'Proposal not found';
  end if;

  if v_proposal.status != 'pending_review' then
    raise exception 'Proposal is not pending review';
  end if;

  select role_id into v_reviewer_role from profiles where id = p_reviewer_id;
  if v_reviewer_role is null then
    raise exception 'Reviewer profile not found';
  end if;

  select count(*) into v_step_order
  from proposal_reviews
  where proposal_id = p_proposal_id and action = 'approved';
  v_step_order := v_step_order + 1;

  select role_id into v_required_role
  from workflow_steps
  where tenant_id = p_tenant_id
    and proposal_type = v_proposal.type
    and step_order = v_step_order;

  if v_required_role is null then
    raise exception 'No workflow step % configured for proposal type %', v_step_order, v_proposal.type;
  end if;

  if v_required_role != v_reviewer_role then
    raise exception 'Reviewer role is not authorized for this workflow step';
  end if;

  insert into proposal_reviews (proposal_id, reviewer_id, action, notes)
  values (p_proposal_id, p_reviewer_id, p_action, p_notes);

  if p_action = 'rejected' then
    update proposals set status = 'rejected', updated_at = now()
    where id = p_proposal_id
    returning * into v_proposal;

  elsif p_action = 'requested_changes' then
    update proposals set status = 'draft', updated_at = now()
    where id = p_proposal_id
    returning * into v_proposal;

  else
    select exists (
      select 1 from workflow_steps
      where tenant_id = p_tenant_id
        and proposal_type = v_proposal.type
        and step_order = v_step_order + 1
    ) into v_has_next;

    if v_has_next then
      -- Still pending_review: waiting on the next step's reviewer.
      null;
    else
      update proposals set status = 'approved', updated_at = now()
      where id = p_proposal_id
      returning * into v_proposal;

      if v_proposal.type = 'bom_change' then
        perform apply_bom_change_payload(p_tenant_id, v_proposal.payload, p_reviewer_id);
      end if;
    end if;
  end if;

  return v_proposal;
end;
$$;
