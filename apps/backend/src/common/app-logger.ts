import { ConsoleLogger, type LogLevel } from "@nestjs/common";

/** Contextos de Nest que solo ensucian el arranque (mapa de rutas / DI). */
const BOOTSTRAP_NOISE = new Set([
  "InstanceLoader",
  "RoutesResolver",
  "RouterExplorer",
  "NestFactory",
]);

/**
 * Logger de Nest que omite el dump de módulos/rutas en desarrollo
 * y conserva error/warn/log de la aplicación.
 */
export class AppLogger extends ConsoleLogger {
  constructor(context?: string, options?: { logLevels?: LogLevel[] }) {
    super(context ?? "App", {
      logLevels: options?.logLevels ?? ["error", "warn", "log"],
    });
  }

  override log(message: unknown, context?: string): void {
    const ctx = typeof context === "string" ? context : this.context;
    if (ctx && BOOTSTRAP_NOISE.has(ctx)) {
      return;
    }
    if (typeof context === "string") {
      super.log(message, context);
      return;
    }
    super.log(message);
  }
}
