import { z } from "zod";

const DEV_JWT_MARKER = "dev-only";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().min(1),
    CORS_ORIGIN: z.string().default("http://localhost:3000"),
    FRONTEND_URL: z.string().default("http://localhost:3000"),
    JWT_SECRET: z.string().min(32, "JWT_SECRET debe tener al menos 32 caracteres"),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(15 * 60),
    REFRESH_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(7 * 24 * 60 * 60),
    RESET_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(60 * 60),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.preprocess(
      (value) => (value === "" || value === undefined ? undefined : Number(value)),
      z.number().int().positive().optional(),
    ),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    MAIL_FROM: z.string().optional(),
    COOKIE_SECURE: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET: z.string().optional(),
    R2_PUBLIC_URL: z.string().optional(),
    /** URL pública del API (para servir /uploads en modo local). Ej: http://localhost:4000 */
    API_PUBLIC_URL: z.string().optional(),
    /** Carpeta local de imágenes cuando R2 no está configurado. Default: ./uploads */
    LOCAL_UPLOAD_DIR: z.string().optional(),
    /** App Secret de Meta (firma X-Hub-Signature-256 del webhook). */
    WHATSAPP_APP_SECRET: z.string().optional(),
    /** Token de verificación del challenge GET del webhook (compartido, una URL). */
    WHATSAPP_VERIFY_TOKEN: z.string().optional(),
    WHATSAPP_GRAPH_API_VERSION: z.string().default("v21.0"),
    WHATSAPP_AUTO_REPLY_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    WHATSAPP_AUTO_REPLY_TEXT: z
      .string()
      .default("Gracias por tu mensaje. Te responderemos pronto."),
    /** En development/test permite omitir la firma del webhook. */
    WHATSAPP_SKIP_SIGNATURE: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    /** Si true, nunca llama a Graph API (marca outbound como sent simulado). */
    WHATSAPP_SIMULATE_SEND: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    /** Responder inbound con IA (OpenRouter) en lugar del texto fijo. */
    AI_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    AI_PROVIDER: z.enum(["openrouter", "openai", "mock"]).default("openrouter"),
    OPENROUTER_API_KEY: z.string().optional(),
    AI_BASE_URL: z.string().default("https://openrouter.ai/api/v1"),
    AI_MODEL: z.string().default("openrouter/free"),
    AI_MAX_PRODUCTS: z.coerce.number().int().positive().default(25),
    AI_HISTORY_LIMIT: z.coerce.number().int().positive().default(8),
    AI_FALLBACK_TEXT: z
      .string()
      .default(
        "Gracias por tu mensaje. En un momento un asesor de la tienda te atenderá por aquí.",
      ),
    AI_HTTP_REFERER: z.string().optional(),
    AI_APP_TITLE: z.string().default("Commerce AI SaaS"),
    WHATSAPP_HANDLER_CHOICE_TEXT: z
      .string()
      .default(
        "¡Hola! ¿Prefieres que te atienda el asistente virtual (bot) o un asesor de la tienda? Responde \"bot\" o \"asesor\".",
      ),
    WHATSAPP_HANDLER_BOT_CONFIRM_TEXT: z
      .string()
      .default(
        "Perfecto. Te atiende el asistente virtual. ¿En qué te puedo ayudar?",
      ),
    WHATSAPP_HANDLER_HUMAN_CONFIRM_TEXT: z
      .string()
      .default(
        "Listo. Un asesor de la tienda continuará esta conversación por aquí.",
      ),
  })
  .superRefine((env, ctx) => {
    if (
      env.AI_ENABLED &&
      env.AI_PROVIDER === "openrouter" &&
      env.NODE_ENV === "production" &&
      !env.OPENROUTER_API_KEY?.trim()
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["OPENROUTER_API_KEY"],
        message: "En production con AI_ENABLED y openrouter se requiere OPENROUTER_API_KEY",
      });
    }
    if (env.NODE_ENV !== "production") {
      return;
    }
    if (!env.COOKIE_SECURE) {
      ctx.addIssue({
        code: "custom",
        path: ["COOKIE_SECURE"],
        message: "En production COOKIE_SECURE debe ser true",
      });
    }
    if (env.JWT_SECRET.toLowerCase().includes(DEV_JWT_MARKER)) {
      ctx.addIssue({
        code: "custom",
        path: ["JWT_SECRET"],
        message: "En production JWT_SECRET no puede ser el valor de desarrollo (dev-only)",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${result.error.message}`);
  }
  return result.data;
}
