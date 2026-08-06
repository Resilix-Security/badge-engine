import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    DATABASE_URL: z
      .string()
      .url()
      .refine(
        (str) => !str.includes("DATABASE_URL"),
        "You forgot to change the default URL",
      ),

    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    NEXTAUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),

    NEXTAUTH_URL: z.preprocess(
      // This makes Vercel deployments not fail if you don't set NEXTAUTH_URL
      // Since NextAuth.js automatically uses the VERCEL_URL if present.
      (str) => process.env.VERCEL_URL ?? str,
      // VERCEL_URL doesn't include `https` so it cant be validated as a URL
      process.env.VERCEL ? z.string() : z.string().url(),
    ),

    AZURE_AD_CLIENT_ID: z.string(),
    AZURE_AD_CLIENT_SECRET: z.string(),
    AZURE_AD_TENANT_ID: z.string(),

    STATUS_SERVICE_URL: z.string().optional(),
    STATUS_LIST_URL: z.string().url().optional(),
    STATUS_LIST_ID: z.string().optional(),

    // "smtp" (nodemailer, e.g. local Mailpit or any generic relay) or "acs"
    // (Azure Communication Services, via its own SDK — it doesn't speak SMTP
    // through this app's integration). Required fields for whichever
    // provider is selected are checked at mailer-init time, not here, since
    // t3-env doesn't cleanly express "required only if X".
    EMAIL_PROVIDER: z.enum(["smtp", "acs"]).default("smtp"),
    // Accepts a bare address or "Display Name <address>" form.
    EMAIL_FROM: z.string().min(1),

    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().default(587),
    // z.coerce.boolean() would treat the string "false" as truthy — match explicitly instead.
    SMTP_SECURE: z
      .string()
      .optional()
      .transform((v) => v === "true"),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),

    ACS_CONNECTION_STRING: z.string().optional(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    // NEXT_PUBLIC_CLIENTVAR: z.string(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    AZURE_AD_CLIENT_ID: process.env.AZURE_AD_CLIENT_ID,
    AZURE_AD_CLIENT_SECRET: process.env.AZURE_AD_CLIENT_SECRET,
    AZURE_AD_TENANT_ID: process.env.AZURE_AD_TENANT_ID,
    STATUS_SERVICE_URL: process.env.STATUS_SERVICE_URL,
    STATUS_LIST_URL: process.env.STATUS_LIST_URL,
    STATUS_LIST_ID: process.env.STATUS_LIST_ID,

    EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
    EMAIL_FROM: process.env.EMAIL_FROM,

    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_SECURE: process.env.SMTP_SECURE,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASSWORD: process.env.SMTP_PASSWORD,

    ACS_CONNECTION_STRING: process.env.ACS_CONNECTION_STRING,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
