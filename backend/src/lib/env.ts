export type TrustProxySetting = boolean | number | string;

export interface ServerEnvironment {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  nodeEnv: string;
  corsOrigins: string[];
  trustProxy: TrustProxySetting;
  smtpHost: string | null;
  smtpPort: number;
  smtpUser: string | null;
  smtpPass: string | null;
  mailFrom: string;
  appWebUrl: string;
}

export function parseTrustProxy(value: string | undefined): TrustProxySetting {
  const normalized = value?.trim();
  if (!normalized) return false;
  if (normalized.toLowerCase() === "true") return true;
  if (normalized.toLowerCase() === "false") return false;
  if (/^\d+$/.test(normalized)) return Number(normalized);
  return normalized;
}

export function validateEnvironment(env: NodeJS.ProcessEnv): ServerEnvironment {
  const errors: string[] = [];
  const databaseUrl = env.DATABASE_URL?.trim() ?? "";
  const jwtSecret = env.JWT_SECRET ?? "";
  const nodeEnv = env.NODE_ENV?.trim() || "development";
  const corsOrigins = (env.CORS_ORIGIN ?? "").split(",").map((origin) => origin.trim()).filter(Boolean);
  const port = env.PORT?.trim() ? Number(env.PORT) : 3000;
  const smtpHost = env.SMTP_HOST?.trim() || null;
  const smtpPort = env.SMTP_PORT?.trim() ? Number(env.SMTP_PORT) : 587;
  const smtpUser = env.SMTP_USER?.trim() || null;
  const smtpPass = env.SMTP_PASS || null;
  const mailFrom = env.MAIL_FROM?.trim() || "RuangKu <no-reply@ruangku.local>";
  const appWebUrl = env.APP_WEB_URL?.trim() || "http://localhost:5173";

  if (!databaseUrl) {
    errors.push("DATABASE_URL wajib diisi.");
  } else {
    try {
      if (new URL(databaseUrl).protocol !== "mysql:") errors.push("DATABASE_URL harus memakai skema mysql://.");
    } catch {
      errors.push("DATABASE_URL bukan URL yang valid.");
    }
  }
  if (jwtSecret.length < 32) errors.push("JWT_SECRET wajib berisi minimal 32 karakter.");
  if (nodeEnv === "production" && corsOrigins.length === 0) {
    errors.push("CORS_ORIGIN wajib diisi saat NODE_ENV=production.");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push("PORT harus berupa bilangan bulat antara 1 dan 65535.");
  }
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
    errors.push("SMTP_PORT harus berupa bilangan bulat antara 1 dan 65535.");
  }
  if ((smtpUser === null) !== (smtpPass === null)) {
    errors.push("SMTP_USER dan SMTP_PASS harus diisi bersama.");
  }
  if (!smtpHost && (smtpUser || smtpPass)) {
    errors.push("SMTP_HOST wajib diisi saat kredensial SMTP dikonfigurasi.");
  }
  try {
    const url = new URL(appWebUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      errors.push("APP_WEB_URL harus memakai skema http:// atau https://.");
    }
  } catch {
    errors.push("APP_WEB_URL bukan URL yang valid.");
  }
  if (!mailFrom) errors.push("MAIL_FROM tidak boleh kosong.");

  if (errors.length) throw new Error(errors.join(" "));

  return {
    port,
    databaseUrl,
    jwtSecret,
    nodeEnv,
    corsOrigins,
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPass,
    mailFrom,
    appWebUrl,
  };
}
