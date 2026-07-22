CREATE TABLE "financialmanager"."schwab_token" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_issued" timestamp with time zone,
	"refresh_token_issued" timestamp with time zone,
	"token_dictionary" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
