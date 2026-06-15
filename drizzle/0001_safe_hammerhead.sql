CREATE TABLE "financialmanager"."institution" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financialmanager"."account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"source_schema" text NOT NULL,
	"source_view" text NOT NULL,
	"column_mapping" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financialmanager"."balance_forward" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"as_of_date" date NOT NULL,
	"amount" numeric(20, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "balance_forward_account_date" UNIQUE("account_id","as_of_date")
);
--> statement-breakpoint
CREATE TABLE "financialmanager"."category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "financialmanager"."transaction_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_schema" text NOT NULL,
	"source_txn_id" text NOT NULL,
	"category_id" uuid NOT NULL,
	"amount" numeric(20, 4) NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financialmanager"."payee" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financialmanager"."budget" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"period" text NOT NULL,
	"amount" numeric(20, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_category_period" UNIQUE("category_id","period")
);
--> statement-breakpoint
CREATE TABLE "financialmanager"."position" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"instrument_class" text NOT NULL,
	"structure_type" text,
	"structure_subtype" text,
	"status" text DEFAULT 'open' NOT NULL,
	"opened_at" date,
	"closed_at" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financialmanager"."position_leg" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"position_id" uuid NOT NULL,
	"source_schema" text NOT NULL,
	"source_fill_id" text NOT NULL,
	"side" text NOT NULL,
	"quantity" numeric(20, 4) NOT NULL,
	"price" numeric(20, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financialmanager"."position_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"position_id" uuid NOT NULL,
	"position_history_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financialmanager"."import_batch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_schema" text NOT NULL,
	"account_id" uuid,
	"status" text DEFAULT 'running' NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"note" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "financialmanager"."account" ADD CONSTRAINT "account_institution_id_institution_id_fk" FOREIGN KEY ("institution_id") REFERENCES "financialmanager"."institution"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financialmanager"."balance_forward" ADD CONSTRAINT "balance_forward_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "financialmanager"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financialmanager"."category" ADD CONSTRAINT "category_parent_id_category_id_fk" FOREIGN KEY ("parent_id") REFERENCES "financialmanager"."category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financialmanager"."transaction_category" ADD CONSTRAINT "transaction_category_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "financialmanager"."category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financialmanager"."budget" ADD CONSTRAINT "budget_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "financialmanager"."category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financialmanager"."position_leg" ADD CONSTRAINT "position_leg_position_id_position_id_fk" FOREIGN KEY ("position_id") REFERENCES "financialmanager"."position"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financialmanager"."position_link" ADD CONSTRAINT "position_link_position_id_position_id_fk" FOREIGN KEY ("position_id") REFERENCES "financialmanager"."position"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financialmanager"."import_batch" ADD CONSTRAINT "import_batch_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "financialmanager"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transaction_category_source_idx" ON "financialmanager"."transaction_category" USING btree ("source_schema","source_txn_id");--> statement-breakpoint
CREATE INDEX "position_leg_position_idx" ON "financialmanager"."position_leg" USING btree ("position_id");--> statement-breakpoint
CREATE INDEX "position_link_position_idx" ON "financialmanager"."position_link" USING btree ("position_id");