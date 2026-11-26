CREATE TABLE "setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "commission" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurant" ADD COLUMN "status_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurant" ADD COLUMN "commission" real DEFAULT 0.15 NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurant" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "rider" ADD COLUMN "status_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "setting" ADD CONSTRAINT "setting_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant" ADD CONSTRAINT "restaurant_commission_check" CHECK ("restaurant"."commission" >= 0 and "restaurant"."commission" <= 0.5);--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_status_check" CHECK ("user"."status" in ('active', 'suspended'));--> statement-breakpoint
-- Forkfly's own kitchens pay no commission.
UPDATE "restaurant" SET "commission" = 0 WHERE "is_own";--> statement-breakpoint
-- Orders placed before commission was recorded get it at the restaurant's rate.
UPDATE "order" o SET "commission" = round((o."pricing"->>'subtotal')::numeric * r."commission")::integer FROM "restaurant" r WHERE r."id" = o."restaurant_id";
