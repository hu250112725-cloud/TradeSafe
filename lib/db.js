// Conexión a PostgreSQL (Neon u otro) + migración automática.
// Requiere la variable de entorno DATABASE_URL.
import { Pool } from "pg";

let pool = null;
let ready = null;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL");
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 3, // serverless: pocas conexiones
    });
  }
  return pool;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  pass_hash text NOT NULL,
  display_name text UNIQUE NOT NULL,
  trainer_name text NOT NULL,
  role text NOT NULL DEFAULT 'user',
  status text NOT NULL DEFAULT 'active',
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  data jsonb NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  offer_id uuid REFERENCES offers(id),
  a_id uuid NOT NULL REFERENCES users(id),
  b_id uuid NOT NULL REFERENCES users(id),
  a_give text NOT NULL,
  state text NOT NULL DEFAULT 'proposal',
  flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  events jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS messages (
  id bigserial PRIMARY KEY,
  trade_id uuid NOT NULL REFERENCES trades(id),
  sender_id uuid REFERENCES users(id),
  kind text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL REFERENCES trades(id),
  reporter_id uuid NOT NULL REFERENCES users(id),
  accused_id uuid NOT NULL REFERENCES users(id),
  claim text NOT NULL,
  defense text,
  status text NOT NULL DEFAULT 'open',
  decided_by uuid,
  deadline timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sanctions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  dispute_id uuid REFERENCES disputes(id),
  level text NOT NULL,
  summary text NOT NULL,
  expires timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit (
  id bigserial PRIMARY KEY,
  actor_id uuid,
  action text NOT NULL,
  target text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(status);
CREATE INDEX IF NOT EXISTS idx_trades_parties ON trades(a_id, b_id);
CREATE INDEX IF NOT EXISTS idx_messages_trade ON messages(trade_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
ALTER TABLE users ADD COLUMN IF NOT EXISTS friend_code text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verif_code text;
CREATE TABLE IF NOT EXISTS images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  trade_id uuid REFERENCES trades(id),
  kind text NOT NULL,
  data text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_images_trade ON images(trade_id);
CREATE INDEX IF NOT EXISTS idx_images_owner ON images(owner_id, kind);
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_fp text;
ALTER TABLE sanctions ADD COLUMN IF NOT EXISTS appeal_status text NOT NULL DEFAULT 'none';
ALTER TABLE sanctions ADD COLUMN IF NOT EXISTS appeal_text text;
ALTER TABLE sanctions ADD COLUMN IF NOT EXISTS appealed_at timestamptz;
ALTER TABLE sanctions ADD COLUMN IF NOT EXISTS appeal_decided_by uuid;
CREATE TABLE IF NOT EXISTS login_attempts (
  id bigserial PRIMARY KEY,
  email text,
  fp text,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts(email, at);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified boolean;
UPDATE users SET email_verified = true WHERE email_verified IS NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_code text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_code_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS showcase jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS b_give jsonb;
CREATE TABLE IF NOT EXISTS wishlist (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  species text NOT NULL,
  shiny_only boolean NOT NULL DEFAULT false,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wishlist_user ON wishlist(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_species ON wishlist(lower(species));
CREATE TABLE IF NOT EXISTS giveaways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  description text,
  prizes jsonb NOT NULL DEFAULT '[]'::jsonb,
  winners jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'open',
  min_trades int NOT NULL DEFAULT 0,
  ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS giveaway_entries (
  id bigserial PRIMARY KEY,
  giveaway_id uuid NOT NULL REFERENCES giveaways(id),
  user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (giveaway_id, user_id)
);
CREATE TABLE IF NOT EXISTS board (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  body text NOT NULL,
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_board_at ON board(created_at DESC);
`;

async function ensureReady() {
  if (!ready) ready = getPool().query(SCHEMA);
  await ready;
}

async function q(text, params) {
  await ensureReady();
  return getPool().query(text, params);
}

export { q };
