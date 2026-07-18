-- Phase 5: submit-proposal / review-proposal / auto-apply-BOM-change.
--
-- Per-tenant workflow_steps (seeded 1-step-per-type by provision_tenant) define
-- who must approve a proposal, in order. review_proposal walks that chain one
-- step at a time and, on the final approval of a bom_change proposal, applies
-- the payload to bom_lines atomically via apply_bom_change_payload -- never
-- split "record the approval" and "apply the change" across application-code
-- round trips, or a crash between them leaves an approved-but-unapplied
-- proposal.

-- Applies a bom_change proposal's payload (create/update/delete bom_lines)
-- in one transaction, auditing each row change. Inserts/updates still run
-- through the ordinary bom_lines triggers (prevent_bom_cycle,
-- prevent_bom_cross_tenant), so a bad proposal payload fails the same way a
-- bad direct API call would.
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
  v_old bom_lines%rowtype;
  v_new bom_lines%rowtype;
begin
  for v_create in
    select * from jsonb_to_recordset(coalesce(p_payload->'create', '[]'::jsonb))
      as x(parent_item_id uuid, child_item_id uuid, quantity numeric, notes text)
  loop
    insert into bom_lines (tenant_id, parent_item_id, child_item_id, quantity, notes)
    values (p_tenant_id, v_create.parent_item_id, v_create.child_item_id, v_create.quantity, v_create.notes)
    returning * into v_new;

    insert into audit_logs (tenant_id, table_name, record_id, action, old_data, new_data, user_id)
    values (p_tenant_id, 'bom_lines', v_new.id, 'INSERT', null, to_jsonb(v_new), p_user_id);
  end loop;

  for v_update in
    select * from jsonb_to_recordset(coalesce(p_payload->'update', '[]'::jsonb))
      as x(id uuid, quantity numeric, notes text)
  loop
    select * into v_old from bom_lines where id = v_update.id and tenant_id = p_tenant_id;
    if not found then
      raise exception 'BOM line % not found for tenant', v_update.id;
    end if;

    update bom_lines
    set quantity = coalesce(v_update.quantity, quantity),
        notes = coalesce(v_update.notes, notes)
    where id = v_update.id and tenant_id = p_tenant_id
    returning * into v_new;

    insert into audit_logs (tenant_id, table_name, record_id, action, old_data, new_data, user_id)
    values (p_tenant_id, 'bom_lines', v_new.id, 'UPDATE', to_jsonb(v_old), to_jsonb(v_new), p_user_id);
  end loop;

  for v_delete_id in
    select value::uuid from jsonb_array_elements_text(coalesce(p_payload->'delete', '[]'::jsonb)) as value
  loop
    select * into v_old from bom_lines where id = v_delete_id and tenant_id = p_tenant_id;
    if not found then
      raise exception 'BOM line % not found for tenant', v_delete_id;
    end if;

    delete from bom_lines where id = v_delete_id and tenant_id = p_tenant_id;

    insert into audit_logs (tenant_id, table_name, record_id, action, old_data, new_data, user_id)
    values (p_tenant_id, 'bom_lines', v_old.id, 'DELETE', to_jsonb(v_old), null, p_user_id);
  end loop;
end;
$$;

-- Moves a draft proposal into pending_review. Only the creator may submit,
-- and only if the tenant has at least one workflow step configured for the
-- proposal's type (otherwise it would sit in pending_review forever with no
-- one able to review it).
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

  insert into audit_logs (tenant_id, table_name, record_id, action, old_data, new_data, user_id)
  values (p_tenant_id, 'proposals', p_proposal_id, 'UPDATE', null, to_jsonb(v_proposal), p_user_id);

  return v_proposal;
end;
$$;

-- Records one reviewer's decision on the proposal's *current* workflow step
-- (determined by counting prior 'approved' reviews) and, on the final
-- approval, marks the proposal approved and applies bom_change payloads.
-- The reviewer's role must match that step's configured role_id -- this is
-- the actual access-control check; requirePermission('proposals.review') at
-- the API layer is only a coarse pre-filter.
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

  insert into audit_logs (tenant_id, table_name, record_id, action, old_data, new_data, user_id)
  values (p_tenant_id, 'proposals', p_proposal_id, 'UPDATE', null, to_jsonb(v_proposal), p_reviewer_id);

  return v_proposal;
end;
$$;
