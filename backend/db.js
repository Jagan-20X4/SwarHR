const { Pool } = require("pg");

function isProductionEnv() {
  return process.env.NODE_ENV === "production";
}

/**
 * Connection priority:
 * 1. PG_HOST + PG_USER + PG_PASSWORD + PG_DATABASE (+ PG_PORT) — RDS / split vars
 * 2. DATABASE_URL — single URI fallback
 *
 * SSL:
 * - PG_SSL=true|false — explicit override
 * - Else: enabled for *.rds.amazonaws.com
 * - Else: enabled for localhost / 127.0.0.1 when PG_TUNNEL=true OR port ≠ 5432
 *   (SSH tunnels to RDS often use localhost:15432 etc.; RDS requires TLS)
 * - Plain localhost:5432 stays non-SSL for typical dev Postgres
 */
function shouldUseSsl(hostRaw, port) {
  if (process.env.PG_SSL === "true" || process.env.PG_SSL === "1") return true;
  if (process.env.PG_SSL === "false" || process.env.PG_SSL === "0") return false;
  if (/\.rds\.amazonaws\.com$/i.test(hostRaw)) return true;
  const isLocal =
    hostRaw === "localhost" || hostRaw === "127.0.0.1" || hostRaw === "::1";
  if (!isLocal) return false;
  if (process.env.PG_TUNNEL === "true" || process.env.PG_TUNNEL === "1")
    return true;
  if (port !== 5432) return true;
  return false;
}

function poolMaxConnections() {
  const v = parseInt(process.env.PG_POOL_MAX || "10", 10);
  return Number.isFinite(v) && v > 0 ? v : 10;
}

/** In production with SSL, default to verifying server cert unless explicitly disabled. */
function sslRejectUnauthorized() {
  const raw = process.env.PG_SSL_REJECT_UNAUTHORIZED;
  if (raw === "false" || raw === "0") return false;
  if (raw === "true" || raw === "1") return true;
  return isProductionEnv();
}

function buildPoolConfig() {
  const max = poolMaxConnections();

  const hostRaw = process.env.PG_HOST && process.env.PG_HOST.trim();

  if (hostRaw) {
    const port = parseInt(process.env.PG_PORT || "5432", 10);
    const database = process.env.PG_DATABASE || "postgres";
    const user = process.env.PG_USER;
    const password = process.env.PG_PASSWORD;

    const useSsl = shouldUseSsl(hostRaw, port);

    const config = {
      host: hostRaw,
      port,
      database,
      user,
      password,
      max,
    };

    if (useSsl) {
      config.ssl = {
        rejectUnauthorized: sslRejectUnauthorized(),
      };
    }

    return config;
  }

  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim()) {
    const config = {
      connectionString: process.env.DATABASE_URL,
      max,
    };
    if (
      process.env.PG_SSL === "true" ||
      process.env.PG_SSL === "1" ||
      /\.rds\.amazonaws\.com/i.test(process.env.DATABASE_URL)
    ) {
      config.ssl = { rejectUnauthorized: sslRejectUnauthorized() };
    }
    return config;
  }

  return { connectionString: undefined, max };
}

const pool = new Pool(buildPoolConfig());

pool.on("error", (err) => {
  console.error("PostgreSQL pool error", err);
});

module.exports = { pool, poolMaxConnections };
