-- profiles(id) is referenced by items.created_by, stock_ledger.user_id,
-- production_orders.created_by, proposals.created_by, and
-- proposal_reviews.reviewer_id with no ON DELETE behavior (default NO
-- ACTION). auth.users -> profiles cascades on delete, so removing a user
-- (directly, or via a tenant delete cascading through profiles.tenant_id)
-- hits these FKs as soon as that profile has ever created an item, logged
-- stock, run production, filed a proposal, or reviewed one -- found via a
-- live smoke test: a tenant delete fails because profiles.tenant_id's
-- cascade and proposals.tenant_id's cascade (-> proposal_reviews via
-- proposal_id) are two independent paths off the same statement, and the
-- reviewer_id check can fire before the other path removes the row.
--
-- SET NULL so historical audit/ownership records survive an actor's
-- removal instead of blocking it, which requires dropping NOT NULL on
-- these "who did this" columns.

alter table items
  alter column created_by drop not null,
  drop constraint items_created_by_fkey,
  add constraint items_created_by_fkey
    foreign key (created_by) references profiles(id) on delete set null;

alter table stock_ledger
  alter column user_id drop not null,
  drop constraint stock_ledger_user_id_fkey,
  add constraint stock_ledger_user_id_fkey
    foreign key (user_id) references profiles(id) on delete set null;

alter table production_orders
  alter column created_by drop not null,
  drop constraint production_orders_created_by_fkey,
  add constraint production_orders_created_by_fkey
    foreign key (created_by) references profiles(id) on delete set null;

alter table proposals
  alter column created_by drop not null,
  drop constraint proposals_created_by_fkey,
  add constraint proposals_created_by_fkey
    foreign key (created_by) references profiles(id) on delete set null;

alter table proposal_reviews
  alter column reviewer_id drop not null,
  drop constraint proposal_reviews_reviewer_id_fkey,
  add constraint proposal_reviews_reviewer_id_fkey
    foreign key (reviewer_id) references profiles(id) on delete set null;
