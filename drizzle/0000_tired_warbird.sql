-- NOTE: the `financialmanager` schema is pre-provisioned on MyDB and owned by
-- the least-privilege `pfm` role; `pfm` has CREATE *within* it but cannot CREATE
-- SCHEMA at the database level. Drizzle's generated `CREATE SCHEMA` was removed
-- so migrations apply cleanly as `pfm` (see specs/infrastructure.md).
CREATE TABLE "financialmanager"."audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"payload" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
