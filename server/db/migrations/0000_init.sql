CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_item" (
	"restaurant_id" text NOT NULL,
	"id" text NOT NULL,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price" integer NOT NULL,
	"emoji" text DEFAULT '🍽️' NOT NULL,
	"popular" boolean DEFAULT false NOT NULL,
	"veg" boolean DEFAULT false NOT NULL,
	"spicy" boolean DEFAULT false NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_item_restaurant_id_id_pk" PRIMARY KEY("restaurant_id","id"),
	CONSTRAINT "menu_item_price_check" CHECK ("menu_item"."price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text,
	"restaurant_id" text NOT NULL,
	"rider_id" text,
	"total" integer NOT NULL,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"restaurant_snapshot" jsonb NOT NULL,
	"address" jsonb NOT NULL,
	"items" jsonb NOT NULL,
	"pricing" jsonb NOT NULL,
	"km" real NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"courier" jsonb NOT NULL,
	"speed" real NOT NULL,
	"pickup_path" jsonb NOT NULL,
	"drop_path" jsonb NOT NULL,
	"timeline" jsonb NOT NULL,
	"gps" jsonb
);
--> statement-breakpoint
CREATE TABLE "restaurant" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"cuisine" text NOT NULL,
	"emoji" text NOT NULL,
	"colors" jsonb NOT NULL,
	"rating" real DEFAULT 0 NOT NULL,
	"reviews" integer DEFAULT 0 NOT NULL,
	"price_level" integer DEFAULT 2 NOT NULL,
	"prep_min" integer DEFAULT 12 NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"is_own" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "restaurant_status_check" CHECK ("restaurant"."status" in ('pending', 'active', 'paused', 'suspended'))
);
--> statement-breakpoint
CREATE TABLE "restaurant_member" (
	"restaurant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'staff' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "restaurant_member_restaurant_id_user_id_pk" PRIMARY KEY("restaurant_id","user_id"),
	CONSTRAINT "restaurant_member_role_check" CHECK ("restaurant_member"."role" in ('owner', 'staff'))
);
--> statement-breakpoint
CREATE TABLE "rider" (
	"user_id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"vehicle" text DEFAULT 'Bicycle' NOT NULL,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rider_status_check" CHECK ("rider"."status" in ('pending', 'approved', 'suspended'))
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'customer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_role_check" CHECK ("user"."role" in ('customer', 'admin'))
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item" ADD CONSTRAINT "menu_item_restaurant_id_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_customer_id_user_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_restaurant_id_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_rider_id_rider_user_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."rider"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_member" ADD CONSTRAINT "restaurant_member_restaurant_id_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_member" ADD CONSTRAINT "restaurant_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rider" ADD CONSTRAINT "rider_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "order_customer_idx" ON "order" USING btree ("customer_id","placed_at");--> statement-breakpoint
CREATE INDEX "order_restaurant_idx" ON "order" USING btree ("restaurant_id","placed_at");--> statement-breakpoint
CREATE INDEX "order_rider_idx" ON "order" USING btree ("rider_id");--> statement-breakpoint
CREATE INDEX "restaurant_member_user_idx" ON "restaurant_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");