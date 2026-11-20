CREATE TABLE "email_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"locale" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_pacing" (
	"key" text PRIMARY KEY NOT NULL,
	"next_allowed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "locale" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "message_items" ADD COLUMN "body_encrypted" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "message_snapshot" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "message_snapshot_hash" text;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_templates_key_locale_key" ON "email_templates" USING btree ("key","locale");