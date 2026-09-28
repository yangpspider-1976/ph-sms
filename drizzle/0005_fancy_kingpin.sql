CREATE TABLE "mobile_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"phone_encrypted" text NOT NULL,
	"phone_hmac" text NOT NULL,
	"phone_mask" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mobile_encrypted" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mobile_hmac" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mobile_mask" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mobile_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mobile_verifications" ADD CONSTRAINT "mobile_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mobile_verifications_user_idx" ON "mobile_verifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "users_mobile_hmac_idx" ON "users" USING btree ("mobile_hmac");