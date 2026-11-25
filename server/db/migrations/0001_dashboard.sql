ALTER TABLE "menu_item" ALTER COLUMN "emoji" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "restaurant" ALTER COLUMN "emoji" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "menu_item" ADD COLUMN "image" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "rejected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "reject_reason" text;--> statement-breakpoint
ALTER TABLE "restaurant" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurant" ADD COLUMN "cover_image" text;--> statement-breakpoint
ALTER TABLE "restaurant" ADD COLUMN "timezone" text DEFAULT 'America/New_York' NOT NULL;