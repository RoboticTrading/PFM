CREATE TABLE "financialmanager"."account_balance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_key" text NOT NULL,
	"name" text,
	"kind" text,
	"balance" numeric(20, 4) NOT NULL,
	"as_of_date" date NOT NULL,
	"is_liability" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_balance_account_key" UNIQUE("account_key")
);
