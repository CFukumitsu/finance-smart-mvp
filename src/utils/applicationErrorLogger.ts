import { supabase } from "@/src/lib/supabase";

type ErrorDetails = {
  name?: string;
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
};

const SENSITIVE_KEYS = [
  "password",
  "senha",
  "token",
  "access_token",
  "refresh_token",
  "authorization",
  "apikey",
  "api_key",
  "service_role",
  "anon_key",
  "secret",
  "cookie",
];

function sanitizeValue(
  value: unknown,
  key = "",
  depth = 0,
): unknown {
  if (depth > 5) {
    return "[MAX_DEPTH]";
  }

  const normalizedKey = key.toLowerCase();

  if (
    SENSITIVE_KEYS.some((sensitiveKey) =>
      normalizedKey.includes(sensitiveKey),
    )
  ) {
    return "[REDACTED]";
  }

  if (typeof value === "string") {
    return value.slice(0, 4000);
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 50)
      .map((item) => sanitizeValue(item, "", depth + 1));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 100)
        .map(([itemKey, itemValue]) => [
          itemKey,
          sanitizeValue(itemValue, itemKey, depth + 1),
        ]),
    );
  }

  return String(value);
}

function normalizeError(error: unknown): ErrorDetails {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  if (error && typeof error === "object") {
    const typedError = error as ErrorDetails;

    return {
      name: typedError.name,
      message: typedError.message ?? "Erro não informado.",
      code: typedError.code,
      details: typedError.details,
      hint: typedError.hint,
    };
  }

  return {
    message: String(error),
  };
}

export async function logApplicationError(
  context: string,
  error: unknown,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const normalizedError = normalizeError(error);

    const { error: logError } = await supabase.rpc(
      "log_application_error",
      {
        p_context: context,
        p_error_name: normalizedError.name ?? null,
        p_error_message:
          normalizedError.message ?? "Erro não informado.",
        p_error_code: normalizedError.code ?? null,
        p_error_details: normalizedError.details ?? null,
        p_error_hint: normalizedError.hint ?? null,
        p_page_url:
          typeof window !== "undefined"
            ? window.location.href
            : null,
        p_user_agent:
          typeof navigator !== "undefined"
            ? navigator.userAgent
            : null,
        p_environment:
          process.env.NODE_ENV ?? null,
        p_app_version:
          process.env.NEXT_PUBLIC_APP_VERSION ?? null,
        p_metadata: metadata
          ? sanitizeValue(metadata)
          : null,
      },
    );

    if (logError) {
      console.error(
        "Não foi possível gravar o log da aplicação:",
        logError,
      );
    }
  } catch (loggerError) {
    // O logger nunca pode impedir o fluxo principal nem substituir o erro original.
    console.error(
      "Falha inesperada no logger da aplicação:",
      loggerError,
    );
  }
}