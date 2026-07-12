


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."ensure_single_default_vehicle"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.is_default = true and new.active = true then
    update public.vehicles
    set
      is_default = false,
      updated_at = now()
    where owner_id = new.owner_id
      and id <> new.id
      and is_default = true;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."ensure_single_default_vehicle"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."account_closures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competence_id" "uuid" NOT NULL,
    "account_id" "uuid" NOT NULL,
    "account_type" "text" NOT NULL,
    "status" "text" DEFAULT 'Fechada'::"text" NOT NULL,
    "closing_balance" numeric DEFAULT 0,
    "invoice_amount" numeric DEFAULT 0,
    "payment_account_id" "uuid",
    "payment_due_date" "date",
    "payment_competence_id" "uuid",
    "generated_transaction_id" "uuid",
    "closed_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "opening_balance" numeric DEFAULT 0,
    "reopened_at" timestamp with time zone,
    "owner_id" "uuid"
);


ALTER TABLE "public"."account_closures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "closing_day" integer,
    "due_day" integer,
    "limit_amount" numeric(12,2) DEFAULT 0,
    "current_balance" numeric(12,2) DEFAULT 0,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "legacy_id" integer,
    "owner_id" "uuid",
    CONSTRAINT "accounts_closing_day_check" CHECK ((("closing_day" >= 1) AND ("closing_day" <= 31))),
    CONSTRAINT "accounts_due_day_check" CHECK ((("due_day" >= 1) AND ("due_day" <= 31))),
    CONSTRAINT "accounts_type_check" CHECK (("type" = ANY (ARRAY['Conta'::"text", 'Cartão'::"text"])))
);


ALTER TABLE "public"."accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backup_personnalite_202606_items_before_reset" (
    "id" "uuid",
    "account_id" "uuid",
    "competence_id" "uuid",
    "statement_date" "date",
    "statement_description" "text",
    "normalized_description" "text",
    "statement_value" numeric,
    "source_hash" "text",
    "status" "text",
    "ignored_reason" "text",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."backup_personnalite_202606_items_before_reset" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backup_personnalite_202606_links_before_reset" (
    "id" "uuid",
    "statement_item_id" "uuid",
    "transaction_id" "uuid",
    "created_at" timestamp with time zone,
    "match_status" "text"
);


ALTER TABLE "public"."backup_personnalite_202606_links_before_reset" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backup_personnalite_202606_statement_before_reset" (
    "id" "uuid",
    "account_id" "uuid",
    "competence_id" "uuid",
    "payment_account_id" "uuid",
    "payment_transaction_id" "uuid",
    "statement_total" numeric,
    "payment_due_date" "date",
    "status" "text",
    "closed_at" timestamp with time zone,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."backup_personnalite_202606_statement_before_reset" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backup_porto_202606_statement_items" (
    "id" "uuid",
    "account_id" "uuid",
    "competence_id" "uuid",
    "statement_date" "date",
    "statement_description" "text",
    "normalized_description" "text",
    "statement_value" numeric,
    "source_hash" "text",
    "status" "text",
    "ignored_reason" "text",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."backup_porto_202606_statement_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backup_porto_202606_statement_links" (
    "id" "uuid",
    "statement_item_id" "uuid",
    "transaction_id" "uuid",
    "created_at" timestamp with time zone,
    "match_status" "text"
);


ALTER TABLE "public"."backup_porto_202606_statement_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backup_porto_202606_statements" (
    "id" "uuid",
    "account_id" "uuid",
    "competence_id" "uuid",
    "payment_account_id" "uuid",
    "payment_transaction_id" "uuid",
    "statement_total" numeric,
    "payment_due_date" "date",
    "status" "text",
    "closed_at" timestamp with time zone,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."backup_porto_202606_statements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "monthly_limit" numeric(12,2) DEFAULT 0,
    "monthly_goal" numeric(12,2) DEFAULT 0,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "legacy_id" integer,
    "show_on_dashboard" boolean DEFAULT true NOT NULL,
    "dashboard_order" integer,
    "owner_id" "uuid",
    "special_type" "text",
    CONSTRAINT "categories_special_type_check" CHECK ((("special_type" IS NULL) OR ("special_type" = ANY (ARRAY['fuel'::"text", 'vehicle_maintenance'::"text", 'parking'::"text", 'toll'::"text", 'vehicle_insurance'::"text"])))),
    CONSTRAINT "categories_type_check" CHECK (("type" = ANY (ARRAY['Receita'::"text", 'Despesa'::"text", 'Transferência'::"text"])))
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


COMMENT ON COLUMN "public"."categories"."special_type" IS 'Identifica categorias com comportamento especial no sistema, como combustível.';



CREATE TABLE IF NOT EXISTS "public"."competence_closures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competence_id" "uuid" NOT NULL,
    "closed_at" timestamp with time zone DEFAULT "now"(),
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "balance" numeric(12,2) DEFAULT 0 NOT NULL,
    "total_income" numeric(12,2) DEFAULT 0 NOT NULL,
    "total_expense" numeric(12,2) DEFAULT 0 NOT NULL,
    "pending_income" numeric(12,2) DEFAULT 0 NOT NULL,
    "pending_expense" numeric(12,2) DEFAULT 0 NOT NULL,
    "paid_income" numeric(12,2) DEFAULT 0 NOT NULL,
    "paid_expense" numeric(12,2) DEFAULT 0 NOT NULL,
    "reopened_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'Aberta'::"text" NOT NULL,
    "opening_balance" numeric DEFAULT 0,
    "calculated_balance" numeric DEFAULT 0,
    "confirmed_balance" numeric DEFAULT 0,
    "owner_id" "uuid",
    CONSTRAINT "competence_closures_status_check" CHECK (("status" = ANY (ARRAY['Aberta'::"text", 'Fechada'::"text"])))
);


ALTER TABLE "public"."competence_closures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."competences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "month" integer NOT NULL,
    "year" integer NOT NULL,
    "name" "text" NOT NULL,
    "status" "text" DEFAULT 'ABERTA'::"text" NOT NULL,
    "closed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "start_date" "date",
    "end_date" "date",
    "owner_id" "uuid",
    CONSTRAINT "competences_month_check" CHECK ((("month" >= 1) AND ("month" <= 12))),
    CONSTRAINT "competences_status_check" CHECK (("status" = ANY (ARRAY['ABERTA'::"text", 'FECHADA'::"text"])))
);


ALTER TABLE "public"."competences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."credit_card_statement_item_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "statement_item_id" "uuid" NOT NULL,
    "transaction_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "match_status" "text" DEFAULT 'Conciliado'::"text" NOT NULL,
    "owner_id" "uuid",
    CONSTRAINT "credit_card_statement_item_transactions_match_status_check" CHECK (("match_status" = ANY (ARRAY['Sugerido'::"text", 'Conciliado'::"text"])))
);


ALTER TABLE "public"."credit_card_statement_item_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."credit_card_statement_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "competence_id" "uuid" NOT NULL,
    "statement_date" "date" NOT NULL,
    "statement_description" "text" NOT NULL,
    "normalized_description" "text" NOT NULL,
    "statement_value" numeric NOT NULL,
    "source_hash" "text" NOT NULL,
    "status" "text" DEFAULT 'Pendente'::"text" NOT NULL,
    "ignored_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "owner_id" "uuid",
    CONSTRAINT "credit_card_statement_items_status_check" CHECK (("status" = ANY (ARRAY['Pendente'::"text", 'Sugerido'::"text", 'Conciliado'::"text", 'Ignorado'::"text"])))
);


ALTER TABLE "public"."credit_card_statement_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."credit_card_statements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "competence_id" "uuid" NOT NULL,
    "payment_account_id" "uuid",
    "payment_transaction_id" "uuid",
    "statement_total" numeric DEFAULT 0 NOT NULL,
    "payment_due_date" "date",
    "status" "text" DEFAULT 'Fechada'::"text" NOT NULL,
    "closed_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "owner_id" "uuid"
);


ALTER TABLE "public"."credit_card_statements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."financial_targets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competence_id" "uuid" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "planned_value" numeric(12,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "owner_id" "uuid",
    CONSTRAINT "financial_targets_target_type_check" CHECK (("target_type" = ANY (ARRAY['account'::"text", 'category'::"text"])))
);


ALTER TABLE "public"."financial_targets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fuel_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "transaction_id" "uuid" NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "fuel_station_id" "uuid",
    "fuel_type" "text" NOT NULL,
    "odometer" numeric(12,1) NOT NULL,
    "liters" numeric(10,3) NOT NULL,
    "price_per_liter" numeric(10,3) NOT NULL,
    "total_value" numeric(12,2) NOT NULL,
    "full_tank" boolean DEFAULT true NOT NULL,
    "latitude" numeric(10,7),
    "longitude" numeric(10,7),
    "recorded_at" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "fuel_records_fuel_type_check" CHECK (("fuel_type" = ANY (ARRAY['Gasolina comum'::"text", 'Gasolina aditivada'::"text", 'Gasolina premium'::"text", 'Etanol'::"text", 'Diesel S10'::"text", 'Diesel S500'::"text", 'GNV'::"text", 'Energia elétrica'::"text", 'Outro'::"text"]))),
    CONSTRAINT "fuel_records_latitude_check" CHECK ((("latitude" IS NULL) OR (("latitude" >= ('-90'::integer)::numeric) AND ("latitude" <= (90)::numeric)))),
    CONSTRAINT "fuel_records_liters_check" CHECK (("liters" > (0)::numeric)),
    CONSTRAINT "fuel_records_longitude_check" CHECK ((("longitude" IS NULL) OR (("longitude" >= ('-180'::integer)::numeric) AND ("longitude" <= (180)::numeric)))),
    CONSTRAINT "fuel_records_odometer_check" CHECK (("odometer" >= (0)::numeric)),
    CONSTRAINT "fuel_records_price_per_liter_check" CHECK (("price_per_liter" > (0)::numeric)),
    CONSTRAINT "fuel_records_total_value_check" CHECK (("total_value" > (0)::numeric))
);


ALTER TABLE "public"."fuel_records" OWNER TO "postgres";


COMMENT ON TABLE "public"."fuel_records" IS 'Detalhes de abastecimento vinculados a lançamentos financeiros.';



COMMENT ON COLUMN "public"."fuel_records"."full_tank" IS 'Indica se o abastecimento completou o tanque, necessário para cálculo confiável de km/l.';



CREATE TABLE IF NOT EXISTS "public"."fuel_stations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "brand" "text",
    "address" "text",
    "neighborhood" "text",
    "city" "text",
    "state" "text",
    "postal_code" "text",
    "latitude" numeric(10,7),
    "longitude" numeric(10,7),
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "google_place_id" "text",
    "google_maps_uri" "text",
    "google_rating" numeric(3,2),
    "google_user_rating_count" integer,
    "google_business_status" "text",
    "google_primary_type" "text",
    "google_display_name" "text",
    "google_formatted_address" "text",
    "google_last_synced_at" timestamp with time zone,
    CONSTRAINT "fuel_stations_google_rating_check" CHECK ((("google_rating" IS NULL) OR (("google_rating" >= (0)::numeric) AND ("google_rating" <= (5)::numeric)))),
    CONSTRAINT "fuel_stations_google_user_rating_count_check" CHECK ((("google_user_rating_count" IS NULL) OR ("google_user_rating_count" >= 0))),
    CONSTRAINT "fuel_stations_latitude_check" CHECK ((("latitude" IS NULL) OR (("latitude" >= ('-90'::integer)::numeric) AND ("latitude" <= (90)::numeric)))),
    CONSTRAINT "fuel_stations_longitude_check" CHECK ((("longitude" IS NULL) OR (("longitude" >= ('-180'::integer)::numeric) AND ("longitude" <= (180)::numeric)))),
    CONSTRAINT "fuel_stations_name_not_empty" CHECK (("length"(TRIM(BOTH FROM "name")) > 0))
);


ALTER TABLE "public"."fuel_stations" OWNER TO "postgres";


COMMENT ON TABLE "public"."fuel_stations" IS 'Postos de combustível cadastrados pelo usuário, com localização opcional.';



COMMENT ON COLUMN "public"."fuel_stations"."google_place_id" IS 'Identificador único do estabelecimento no Google Places.';



COMMENT ON COLUMN "public"."fuel_stations"."google_maps_uri" IS 'Link oficial do estabelecimento no Google Maps.';



COMMENT ON COLUMN "public"."fuel_stations"."google_last_synced_at" IS 'Data da última atualização dos dados obtidos no Google Places.';



CREATE TABLE IF NOT EXISTS "public"."import_layouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "name" "text" DEFAULT 'Modelo padrão'::"text" NOT NULL,
    "header_row_index" integer DEFAULT 0 NOT NULL,
    "date_header" "text" NOT NULL,
    "description_header" "text" NOT NULL,
    "value_header" "text" NOT NULL,
    "installment_header" "text",
    "amount_sign" "text" DEFAULT 'auto'::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "owner_id" "uuid",
    CONSTRAINT "import_layouts_amount_sign_check" CHECK (("amount_sign" = ANY (ARRAY['auto'::"text", 'positive'::"text", 'negative'::"text"])))
);


ALTER TABLE "public"."import_layouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recurring_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "description" "text" NOT NULL,
    "type" "text" NOT NULL,
    "amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "account_id" "uuid",
    "category_id" "uuid",
    "frequency" "text" DEFAULT 'monthly'::"text" NOT NULL,
    "start_competence_id" "uuid" NOT NULL,
    "end_competence_id" "uuid",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "day_of_month" integer DEFAULT 1 NOT NULL,
    "owner_id" "uuid",
    CONSTRAINT "recurring_transactions_day_check" CHECK ((("day_of_month" >= 1) AND ("day_of_month" <= 31))),
    CONSTRAINT "recurring_transactions_day_of_month_check" CHECK ((("day_of_month" >= 1) AND ("day_of_month" <= 31))),
    CONSTRAINT "recurring_transactions_frequency_check" CHECK (("frequency" = 'monthly'::"text")),
    CONSTRAINT "recurring_transactions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "recurring_transactions_type_check" CHECK (("type" = ANY (ARRAY['income'::"text", 'expense'::"text"])))
);


ALTER TABLE "public"."recurring_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."statement_import_layouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "account_id" "uuid",
    "file_type" "text" DEFAULT 'excel'::"text" NOT NULL,
    "header_row" integer DEFAULT 1 NOT NULL,
    "date_column" "text" NOT NULL,
    "description_column" "text" NOT NULL,
    "value_column" "text" NOT NULL,
    "amount_sign" "text" DEFAULT 'as_is'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."statement_import_layouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_routines" (
    "id" "text" NOT NULL,
    "last_run_date" "date",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."system_routines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transaction_reconciliations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "competence_id" "uuid" NOT NULL,
    "import_key" "text" NOT NULL,
    "statement_date" "date" NOT NULL,
    "statement_description" "text" NOT NULL,
    "statement_value" numeric NOT NULL,
    "transaction_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "ignored" boolean DEFAULT false NOT NULL,
    "ignore_reason" "text"
);


ALTER TABLE "public"."transaction_reconciliations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competence_id" "uuid" NOT NULL,
    "category_id" "uuid",
    "account_id" "uuid",
    "description" "text" NOT NULL,
    "due_date" "date" NOT NULL,
    "type" "text" NOT NULL,
    "mode" "text" DEFAULT 'unico'::"text" NOT NULL,
    "value" numeric(12,2) NOT NULL,
    "installment_number" integer,
    "installment_total" integer,
    "status" "text" DEFAULT 'Pendente'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recurring_transaction_id" "uuid",
    "legacy_id" integer,
    "parcel_number" integer,
    "total_parcels" integer,
    "destination_account_id" "uuid",
    "card_payment_account_id" "uuid",
    "origin_account_id" "uuid",
    "owner_id" "uuid",
    CONSTRAINT "transactions_mode_check" CHECK (("mode" = ANY (ARRAY['unico'::"text", 'parcelado'::"text", 'recorrente'::"text"]))),
    CONSTRAINT "transactions_status_check" CHECK (("status" = ANY (ARRAY['Pendente'::"text", 'Pago'::"text", 'Recebido'::"text"]))),
    CONSTRAINT "transactions_type_check" CHECK (("type" = ANY (ARRAY['Receita'::"text", 'Despesa'::"text", 'Transferência'::"text", 'Pagamento de Fatura'::"text"])))
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "brand" "text",
    "model" "text",
    "model_year" integer,
    "plate" "text",
    "fuel_type" "text" DEFAULT 'Gasolina'::"text" NOT NULL,
    "tank_capacity" numeric(10,2),
    "initial_odometer" numeric(12,1),
    "is_default" boolean DEFAULT false NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "vehicles_fuel_type_check" CHECK (("fuel_type" = ANY (ARRAY['Gasolina'::"text", 'Etanol'::"text", 'Flex'::"text", 'Diesel'::"text", 'Elétrico'::"text", 'Híbrido'::"text", 'GNV'::"text", 'Outro'::"text"]))),
    CONSTRAINT "vehicles_initial_odometer_check" CHECK ((("initial_odometer" IS NULL) OR ("initial_odometer" >= (0)::numeric))),
    CONSTRAINT "vehicles_model_year_check" CHECK ((("model_year" IS NULL) OR (("model_year" >= 1900) AND ("model_year" <= 2200)))),
    CONSTRAINT "vehicles_name_not_empty" CHECK (("length"(TRIM(BOTH FROM "name")) > 0)),
    CONSTRAINT "vehicles_tank_capacity_check" CHECK ((("tank_capacity" IS NULL) OR ("tank_capacity" > (0)::numeric)))
);


ALTER TABLE "public"."vehicles" OWNER TO "postgres";


COMMENT ON TABLE "public"."vehicles" IS 'Veículos utilizados pelo usuário para controle de combustível, consumo e despesas.';



COMMENT ON COLUMN "public"."vehicles"."is_default" IS 'Define o veículo selecionado automaticamente em novos abastecimentos.';



ALTER TABLE ONLY "public"."account_closures"
    ADD CONSTRAINT "account_closures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."account_closures"
    ADD CONSTRAINT "account_closures_unique" UNIQUE ("competence_id", "account_id");



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."competence_closures"
    ADD CONSTRAINT "competence_closures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."competences"
    ADD CONSTRAINT "competences_month_year_key" UNIQUE ("month", "year");



ALTER TABLE ONLY "public"."competences"
    ADD CONSTRAINT "competences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credit_card_statement_item_transactions"
    ADD CONSTRAINT "credit_card_statement_item_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credit_card_statement_item_transactions"
    ADD CONSTRAINT "credit_card_statement_item_transactions_unique" UNIQUE ("statement_item_id", "transaction_id");



ALTER TABLE ONLY "public"."credit_card_statement_items"
    ADD CONSTRAINT "credit_card_statement_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credit_card_statement_items"
    ADD CONSTRAINT "credit_card_statement_items_unique" UNIQUE ("account_id", "competence_id", "source_hash");



ALTER TABLE ONLY "public"."credit_card_statements"
    ADD CONSTRAINT "credit_card_statements_account_id_competence_id_key" UNIQUE ("account_id", "competence_id");



ALTER TABLE ONLY "public"."credit_card_statements"
    ADD CONSTRAINT "credit_card_statements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financial_targets"
    ADD CONSTRAINT "financial_targets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financial_targets"
    ADD CONSTRAINT "financial_targets_unique" UNIQUE ("competence_id", "target_type", "target_id");



ALTER TABLE ONLY "public"."fuel_records"
    ADD CONSTRAINT "fuel_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fuel_records"
    ADD CONSTRAINT "fuel_records_transaction_unique" UNIQUE ("transaction_id");



ALTER TABLE ONLY "public"."fuel_stations"
    ADD CONSTRAINT "fuel_stations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."import_layouts"
    ADD CONSTRAINT "import_layouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recurring_transactions"
    ADD CONSTRAINT "recurring_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."statement_import_layouts"
    ADD CONSTRAINT "statement_import_layouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_routines"
    ADD CONSTRAINT "system_routines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transaction_reconciliations"
    ADD CONSTRAINT "transaction_reconciliations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "account_closures_competence_account_unique" ON "public"."account_closures" USING "btree" ("competence_id", "account_id");



CREATE UNIQUE INDEX "competence_closures_competence_id_key" ON "public"."competence_closures" USING "btree" ("competence_id");



CREATE UNIQUE INDEX "competence_closures_owner_competence_idx" ON "public"."competence_closures" USING "btree" ("owner_id", "competence_id");



CREATE UNIQUE INDEX "credit_card_statements_owner_account_competence_idx" ON "public"."credit_card_statements" USING "btree" ("owner_id", "account_id", "competence_id");



CREATE UNIQUE INDEX "financial_targets_unique_target" ON "public"."financial_targets" USING "btree" ("owner_id", "competence_id", "target_type", "target_id");



CREATE INDEX "fuel_records_owner_station_idx" ON "public"."fuel_records" USING "btree" ("owner_id", "fuel_station_id");



CREATE INDEX "fuel_records_owner_vehicle_date_idx" ON "public"."fuel_records" USING "btree" ("owner_id", "vehicle_id", "recorded_at" DESC);



CREATE INDEX "fuel_records_transaction_idx" ON "public"."fuel_records" USING "btree" ("transaction_id");



CREATE INDEX "fuel_stations_google_place_idx" ON "public"."fuel_stations" USING "btree" ("google_place_id") WHERE ("google_place_id" IS NOT NULL);



CREATE INDEX "fuel_stations_owner_active_idx" ON "public"."fuel_stations" USING "btree" ("owner_id", "active");



CREATE UNIQUE INDEX "fuel_stations_owner_google_place_unique" ON "public"."fuel_stations" USING "btree" ("owner_id", "google_place_id") WHERE (("google_place_id" IS NOT NULL) AND (TRIM(BOTH FROM "google_place_id") <> ''::"text"));



CREATE INDEX "fuel_stations_owner_location_idx" ON "public"."fuel_stations" USING "btree" ("owner_id", "latitude", "longitude");



CREATE INDEX "idx_competences_month_year" ON "public"."competences" USING "btree" ("month", "year");



CREATE INDEX "idx_financial_targets_competence" ON "public"."financial_targets" USING "btree" ("competence_id");



CREATE INDEX "idx_financial_targets_target" ON "public"."financial_targets" USING "btree" ("target_type", "target_id");



CREATE INDEX "idx_import_layouts_account_id" ON "public"."import_layouts" USING "btree" ("account_id");



CREATE INDEX "idx_recurring_transactions_account" ON "public"."recurring_transactions" USING "btree" ("account_id");



CREATE INDEX "idx_recurring_transactions_category" ON "public"."recurring_transactions" USING "btree" ("category_id");



CREATE INDEX "idx_recurring_transactions_start_competence" ON "public"."recurring_transactions" USING "btree" ("start_competence_id");



CREATE INDEX "idx_recurring_transactions_status" ON "public"."recurring_transactions" USING "btree" ("status");



CREATE INDEX "idx_transactions_account_id" ON "public"."transactions" USING "btree" ("account_id");



CREATE INDEX "idx_transactions_category_id" ON "public"."transactions" USING "btree" ("category_id");



CREATE INDEX "idx_transactions_competence_id" ON "public"."transactions" USING "btree" ("competence_id");



CREATE INDEX "idx_transactions_due_date" ON "public"."transactions" USING "btree" ("due_date");



CREATE INDEX "idx_transactions_status" ON "public"."transactions" USING "btree" ("status");



CREATE UNIQUE INDEX "import_layouts_owner_account_active_idx" ON "public"."import_layouts" USING "btree" ("owner_id", "account_id") WHERE ("active" = true);



CREATE UNIQUE INDEX "transaction_reconciliations_unique" ON "public"."transaction_reconciliations" USING "btree" ("account_id", "competence_id", "import_key", "transaction_id");



CREATE UNIQUE INDEX "vehicles_one_default_per_owner" ON "public"."vehicles" USING "btree" ("owner_id") WHERE (("is_default" = true) AND ("active" = true));



CREATE INDEX "vehicles_owner_active_idx" ON "public"."vehicles" USING "btree" ("owner_id", "active");



CREATE UNIQUE INDEX "vehicles_owner_plate_unique" ON "public"."vehicles" USING "btree" ("owner_id", "upper"(TRIM(BOTH FROM "plate"))) WHERE (("plate" IS NOT NULL) AND (TRIM(BOTH FROM "plate") <> ''::"text"));



CREATE OR REPLACE TRIGGER "ensure_single_default_vehicle_trigger" BEFORE INSERT OR UPDATE OF "is_default", "active" ON "public"."vehicles" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_single_default_vehicle"();



CREATE OR REPLACE TRIGGER "set_accounts_updated_at" BEFORE UPDATE ON "public"."accounts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_categories_updated_at" BEFORE UPDATE ON "public"."categories" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_competences_updated_at" BEFORE UPDATE ON "public"."competences" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_fuel_records_updated_at" BEFORE UPDATE ON "public"."fuel_records" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_fuel_stations_updated_at" BEFORE UPDATE ON "public"."fuel_stations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_transactions_updated_at" BEFORE UPDATE ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_vehicles_updated_at" BEFORE UPDATE ON "public"."vehicles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."account_closures"
    ADD CONSTRAINT "account_closures_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."account_closures"
    ADD CONSTRAINT "account_closures_competence_id_fkey" FOREIGN KEY ("competence_id") REFERENCES "public"."competences"("id");



ALTER TABLE ONLY "public"."account_closures"
    ADD CONSTRAINT "account_closures_generated_transaction_id_fkey" FOREIGN KEY ("generated_transaction_id") REFERENCES "public"."transactions"("id");



ALTER TABLE ONLY "public"."account_closures"
    ADD CONSTRAINT "account_closures_payment_account_id_fkey" FOREIGN KEY ("payment_account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."account_closures"
    ADD CONSTRAINT "account_closures_payment_competence_id_fkey" FOREIGN KEY ("payment_competence_id") REFERENCES "public"."competences"("id");



ALTER TABLE ONLY "public"."competence_closures"
    ADD CONSTRAINT "competence_closures_competence_id_fkey" FOREIGN KEY ("competence_id") REFERENCES "public"."competences"("id");



ALTER TABLE ONLY "public"."credit_card_statement_item_transactions"
    ADD CONSTRAINT "credit_card_statement_item_transactions_statement_item_id_fkey" FOREIGN KEY ("statement_item_id") REFERENCES "public"."credit_card_statement_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credit_card_statement_item_transactions"
    ADD CONSTRAINT "credit_card_statement_item_transactions_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credit_card_statement_items"
    ADD CONSTRAINT "credit_card_statement_items_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credit_card_statement_items"
    ADD CONSTRAINT "credit_card_statement_items_competence_id_fkey" FOREIGN KEY ("competence_id") REFERENCES "public"."competences"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credit_card_statements"
    ADD CONSTRAINT "credit_card_statements_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."credit_card_statements"
    ADD CONSTRAINT "credit_card_statements_competence_id_fkey" FOREIGN KEY ("competence_id") REFERENCES "public"."competences"("id");



ALTER TABLE ONLY "public"."credit_card_statements"
    ADD CONSTRAINT "credit_card_statements_payment_account_id_fkey" FOREIGN KEY ("payment_account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."credit_card_statements"
    ADD CONSTRAINT "credit_card_statements_payment_transaction_id_fkey" FOREIGN KEY ("payment_transaction_id") REFERENCES "public"."transactions"("id");



ALTER TABLE ONLY "public"."financial_targets"
    ADD CONSTRAINT "financial_targets_competence_id_fkey" FOREIGN KEY ("competence_id") REFERENCES "public"."competences"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "fk_transactions_destination_account" FOREIGN KEY ("destination_account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."fuel_records"
    ADD CONSTRAINT "fuel_records_fuel_station_id_fkey" FOREIGN KEY ("fuel_station_id") REFERENCES "public"."fuel_stations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fuel_records"
    ADD CONSTRAINT "fuel_records_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fuel_records"
    ADD CONSTRAINT "fuel_records_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fuel_records"
    ADD CONSTRAINT "fuel_records_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."fuel_stations"
    ADD CONSTRAINT "fuel_stations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."import_layouts"
    ADD CONSTRAINT "import_layouts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."import_layouts"
    ADD CONSTRAINT "import_layouts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."recurring_transactions"
    ADD CONSTRAINT "recurring_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."recurring_transactions"
    ADD CONSTRAINT "recurring_transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id");



ALTER TABLE ONLY "public"."recurring_transactions"
    ADD CONSTRAINT "recurring_transactions_end_competence_id_fkey" FOREIGN KEY ("end_competence_id") REFERENCES "public"."competences"("id");



ALTER TABLE ONLY "public"."recurring_transactions"
    ADD CONSTRAINT "recurring_transactions_start_competence_id_fkey" FOREIGN KEY ("start_competence_id") REFERENCES "public"."competences"("id");



ALTER TABLE ONLY "public"."statement_import_layouts"
    ADD CONSTRAINT "statement_import_layouts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."transaction_reconciliations"
    ADD CONSTRAINT "transaction_reconciliations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."transaction_reconciliations"
    ADD CONSTRAINT "transaction_reconciliations_competence_id_fkey" FOREIGN KEY ("competence_id") REFERENCES "public"."competences"("id");



ALTER TABLE ONLY "public"."transaction_reconciliations"
    ADD CONSTRAINT "transaction_reconciliations_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_card_payment_account_id_fkey" FOREIGN KEY ("card_payment_account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_competence_id_fkey" FOREIGN KEY ("competence_id") REFERENCES "public"."competences"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_origin_account_id_fkey" FOREIGN KEY ("origin_account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Allow all statement import layouts" ON "public"."statement_import_layouts" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all transaction reconciliations" ON "public"."transaction_reconciliations" USING (true) WITH CHECK (true);



ALTER TABLE "public"."account_closures" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "account_closures_owner_delete" ON "public"."account_closures" FOR DELETE TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "account_closures_owner_insert" ON "public"."account_closures" FOR INSERT TO "authenticated" WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "account_closures_owner_select" ON "public"."account_closures" FOR SELECT TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "account_closures_owner_update" ON "public"."account_closures" FOR UPDATE TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "accounts_owner_delete" ON "public"."accounts" FOR DELETE TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "accounts_owner_insert" ON "public"."accounts" FOR INSERT TO "authenticated" WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "accounts_owner_select" ON "public"."accounts" FOR SELECT TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "accounts_owner_update" ON "public"."accounts" FOR UPDATE TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "categories_owner_delete" ON "public"."categories" FOR DELETE TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "categories_owner_insert" ON "public"."categories" FOR INSERT TO "authenticated" WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "categories_owner_select" ON "public"."categories" FOR SELECT TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "categories_owner_update" ON "public"."categories" FOR UPDATE TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."competence_closures" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "competence_closures_owner_delete" ON "public"."competence_closures" FOR DELETE TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "competence_closures_owner_insert" ON "public"."competence_closures" FOR INSERT TO "authenticated" WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "competence_closures_owner_select" ON "public"."competence_closures" FOR SELECT TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "competence_closures_owner_update" ON "public"."competence_closures" FOR UPDATE TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."competences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "competences_owner_delete" ON "public"."competences" FOR DELETE TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "competences_owner_insert" ON "public"."competences" FOR INSERT TO "authenticated" WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "competences_owner_select" ON "public"."competences" FOR SELECT TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "competences_owner_update" ON "public"."competences" FOR UPDATE TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."credit_card_statement_item_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "credit_card_statement_item_transactions_owner_delete" ON "public"."credit_card_statement_item_transactions" FOR DELETE TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "credit_card_statement_item_transactions_owner_insert" ON "public"."credit_card_statement_item_transactions" FOR INSERT TO "authenticated" WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "credit_card_statement_item_transactions_owner_select" ON "public"."credit_card_statement_item_transactions" FOR SELECT TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "credit_card_statement_item_transactions_owner_update" ON "public"."credit_card_statement_item_transactions" FOR UPDATE TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."credit_card_statement_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "credit_card_statement_items_owner_delete" ON "public"."credit_card_statement_items" FOR DELETE TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "credit_card_statement_items_owner_insert" ON "public"."credit_card_statement_items" FOR INSERT TO "authenticated" WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "credit_card_statement_items_owner_select" ON "public"."credit_card_statement_items" FOR SELECT TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "credit_card_statement_items_owner_update" ON "public"."credit_card_statement_items" FOR UPDATE TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."credit_card_statements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "credit_card_statements_owner_delete" ON "public"."credit_card_statements" FOR DELETE TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "credit_card_statements_owner_insert" ON "public"."credit_card_statements" FOR INSERT TO "authenticated" WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "credit_card_statements_owner_select" ON "public"."credit_card_statements" FOR SELECT TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "credit_card_statements_owner_update" ON "public"."credit_card_statements" FOR UPDATE TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."financial_targets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "financial_targets_owner_delete" ON "public"."financial_targets" FOR DELETE TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "financial_targets_owner_insert" ON "public"."financial_targets" FOR INSERT TO "authenticated" WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "financial_targets_owner_select" ON "public"."financial_targets" FOR SELECT TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "financial_targets_owner_update" ON "public"."financial_targets" FOR UPDATE TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."fuel_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fuel_records_delete_own" ON "public"."fuel_records" FOR DELETE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "fuel_records_insert_own" ON "public"."fuel_records" FOR INSERT WITH CHECK ((("owner_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."transactions" "transaction"
  WHERE (("transaction"."id" = "fuel_records"."transaction_id") AND ("transaction"."owner_id" = "auth"."uid"())))) AND (EXISTS ( SELECT 1
   FROM "public"."vehicles" "vehicle"
  WHERE (("vehicle"."id" = "fuel_records"."vehicle_id") AND ("vehicle"."owner_id" = "auth"."uid"())))) AND (("fuel_station_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."fuel_stations" "station"
  WHERE (("station"."id" = "fuel_records"."fuel_station_id") AND ("station"."owner_id" = "auth"."uid"())))))));



CREATE POLICY "fuel_records_select_own" ON "public"."fuel_records" FOR SELECT USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "fuel_records_update_own" ON "public"."fuel_records" FOR UPDATE USING (("owner_id" = "auth"."uid"())) WITH CHECK ((("owner_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."transactions" "transaction"
  WHERE (("transaction"."id" = "fuel_records"."transaction_id") AND ("transaction"."owner_id" = "auth"."uid"())))) AND (EXISTS ( SELECT 1
   FROM "public"."vehicles" "vehicle"
  WHERE (("vehicle"."id" = "fuel_records"."vehicle_id") AND ("vehicle"."owner_id" = "auth"."uid"())))) AND (("fuel_station_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."fuel_stations" "station"
  WHERE (("station"."id" = "fuel_records"."fuel_station_id") AND ("station"."owner_id" = "auth"."uid"())))))));



ALTER TABLE "public"."fuel_stations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fuel_stations_delete_own" ON "public"."fuel_stations" FOR DELETE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "fuel_stations_insert_own" ON "public"."fuel_stations" FOR INSERT WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "fuel_stations_select_own" ON "public"."fuel_stations" FOR SELECT USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "fuel_stations_update_own" ON "public"."fuel_stations" FOR UPDATE USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."import_layouts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "import_layouts_owner_delete" ON "public"."import_layouts" FOR DELETE TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "import_layouts_owner_insert" ON "public"."import_layouts" FOR INSERT TO "authenticated" WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "import_layouts_owner_select" ON "public"."import_layouts" FOR SELECT TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "import_layouts_owner_update" ON "public"."import_layouts" FOR UPDATE TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."recurring_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recurring_transactions_owner_delete" ON "public"."recurring_transactions" FOR DELETE TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "recurring_transactions_owner_insert" ON "public"."recurring_transactions" FOR INSERT TO "authenticated" WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "recurring_transactions_owner_select" ON "public"."recurring_transactions" FOR SELECT TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "recurring_transactions_owner_update" ON "public"."recurring_transactions" FOR UPDATE TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."statement_import_layouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_routines" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "system_routines_insert" ON "public"."system_routines" FOR INSERT WITH CHECK (true);



CREATE POLICY "system_routines_select" ON "public"."system_routines" FOR SELECT USING (true);



CREATE POLICY "system_routines_update" ON "public"."system_routines" FOR UPDATE USING (true);



ALTER TABLE "public"."transaction_reconciliations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transactions_owner_delete" ON "public"."transactions" FOR DELETE TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "transactions_owner_insert" ON "public"."transactions" FOR INSERT TO "authenticated" WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "transactions_owner_select" ON "public"."transactions" FOR SELECT TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "transactions_owner_update" ON "public"."transactions" FOR UPDATE TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."vehicles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vehicles_delete_own" ON "public"."vehicles" FOR DELETE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "vehicles_insert_own" ON "public"."vehicles" FOR INSERT WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "vehicles_select_own" ON "public"."vehicles" FOR SELECT USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "vehicles_update_own" ON "public"."vehicles" FOR UPDATE USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."ensure_single_default_vehicle"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_single_default_vehicle"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_single_default_vehicle"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";


















GRANT ALL ON TABLE "public"."account_closures" TO "anon";
GRANT ALL ON TABLE "public"."account_closures" TO "authenticated";
GRANT ALL ON TABLE "public"."account_closures" TO "service_role";



GRANT ALL ON TABLE "public"."accounts" TO "anon";
GRANT ALL ON TABLE "public"."accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."accounts" TO "service_role";



GRANT ALL ON TABLE "public"."backup_personnalite_202606_items_before_reset" TO "anon";
GRANT ALL ON TABLE "public"."backup_personnalite_202606_items_before_reset" TO "authenticated";
GRANT ALL ON TABLE "public"."backup_personnalite_202606_items_before_reset" TO "service_role";



GRANT ALL ON TABLE "public"."backup_personnalite_202606_links_before_reset" TO "anon";
GRANT ALL ON TABLE "public"."backup_personnalite_202606_links_before_reset" TO "authenticated";
GRANT ALL ON TABLE "public"."backup_personnalite_202606_links_before_reset" TO "service_role";



GRANT ALL ON TABLE "public"."backup_personnalite_202606_statement_before_reset" TO "anon";
GRANT ALL ON TABLE "public"."backup_personnalite_202606_statement_before_reset" TO "authenticated";
GRANT ALL ON TABLE "public"."backup_personnalite_202606_statement_before_reset" TO "service_role";



GRANT ALL ON TABLE "public"."backup_porto_202606_statement_items" TO "anon";
GRANT ALL ON TABLE "public"."backup_porto_202606_statement_items" TO "authenticated";
GRANT ALL ON TABLE "public"."backup_porto_202606_statement_items" TO "service_role";



GRANT ALL ON TABLE "public"."backup_porto_202606_statement_links" TO "anon";
GRANT ALL ON TABLE "public"."backup_porto_202606_statement_links" TO "authenticated";
GRANT ALL ON TABLE "public"."backup_porto_202606_statement_links" TO "service_role";



GRANT ALL ON TABLE "public"."backup_porto_202606_statements" TO "anon";
GRANT ALL ON TABLE "public"."backup_porto_202606_statements" TO "authenticated";
GRANT ALL ON TABLE "public"."backup_porto_202606_statements" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."competence_closures" TO "anon";
GRANT ALL ON TABLE "public"."competence_closures" TO "authenticated";
GRANT ALL ON TABLE "public"."competence_closures" TO "service_role";



GRANT ALL ON TABLE "public"."competences" TO "anon";
GRANT ALL ON TABLE "public"."competences" TO "authenticated";
GRANT ALL ON TABLE "public"."competences" TO "service_role";



GRANT ALL ON TABLE "public"."credit_card_statement_item_transactions" TO "anon";
GRANT ALL ON TABLE "public"."credit_card_statement_item_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."credit_card_statement_item_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."credit_card_statement_items" TO "anon";
GRANT ALL ON TABLE "public"."credit_card_statement_items" TO "authenticated";
GRANT ALL ON TABLE "public"."credit_card_statement_items" TO "service_role";



GRANT ALL ON TABLE "public"."credit_card_statements" TO "anon";
GRANT ALL ON TABLE "public"."credit_card_statements" TO "authenticated";
GRANT ALL ON TABLE "public"."credit_card_statements" TO "service_role";



GRANT ALL ON TABLE "public"."financial_targets" TO "anon";
GRANT ALL ON TABLE "public"."financial_targets" TO "authenticated";
GRANT ALL ON TABLE "public"."financial_targets" TO "service_role";



GRANT ALL ON TABLE "public"."fuel_records" TO "anon";
GRANT ALL ON TABLE "public"."fuel_records" TO "authenticated";
GRANT ALL ON TABLE "public"."fuel_records" TO "service_role";



GRANT ALL ON TABLE "public"."fuel_stations" TO "anon";
GRANT ALL ON TABLE "public"."fuel_stations" TO "authenticated";
GRANT ALL ON TABLE "public"."fuel_stations" TO "service_role";



GRANT ALL ON TABLE "public"."import_layouts" TO "anon";
GRANT ALL ON TABLE "public"."import_layouts" TO "authenticated";
GRANT ALL ON TABLE "public"."import_layouts" TO "service_role";



GRANT ALL ON TABLE "public"."recurring_transactions" TO "anon";
GRANT ALL ON TABLE "public"."recurring_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."recurring_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."statement_import_layouts" TO "anon";
GRANT ALL ON TABLE "public"."statement_import_layouts" TO "authenticated";
GRANT ALL ON TABLE "public"."statement_import_layouts" TO "service_role";



GRANT ALL ON TABLE "public"."system_routines" TO "anon";
GRANT ALL ON TABLE "public"."system_routines" TO "authenticated";
GRANT ALL ON TABLE "public"."system_routines" TO "service_role";



GRANT ALL ON TABLE "public"."transaction_reconciliations" TO "anon";
GRANT ALL ON TABLE "public"."transaction_reconciliations" TO "authenticated";
GRANT ALL ON TABLE "public"."transaction_reconciliations" TO "service_role";



GRANT ALL ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";



GRANT ALL ON TABLE "public"."vehicles" TO "anon";
GRANT ALL ON TABLE "public"."vehicles" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicles" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































