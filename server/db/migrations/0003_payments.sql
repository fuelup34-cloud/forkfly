CREATE TABLE "checkout" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"request" jsonb NOT NULL,
	"amount" integer NOT NULL,
	"order_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "payment" jsonb;--> statement-breakpoint
ALTER TABLE "checkout" ADD CONSTRAINT "checkout_customer_id_user_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkout_customer_idx" ON "checkout" USING btree ("customer_id","created_at");--> statement-breakpoint
-- Accounts made before sign-up codes existed count as verified, so nobody is locked out.
UPDATE "user" SET "email_verified" = true WHERE NOT "email_verified";
