-- position_history.position_id is a uuid (not bigint); correct the link column.
-- position_link is empty + newly created, so drop/re-add (bigint→uuid has no cast).
ALTER TABLE "financialmanager"."position_link" DROP COLUMN "position_history_id";--> statement-breakpoint
ALTER TABLE "financialmanager"."position_link" ADD COLUMN "position_history_id" uuid NOT NULL;