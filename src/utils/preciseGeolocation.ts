const isDevelopment = process.env.NODE_ENV === "development";

function logFuelGeolocationDev(
  event: string,
  details: Record<string, unknown> = {}
) {
  if (!isDevelopment) return;

  console.debug("[fuel-geolocation]", {
    event,
    timestamp: new Date().toISOString(),
    ...details,
  });
}

export const PREFERRED_GEOLOCATION_ACCURACY_METERS = 100;
export const MAXIMUM_GEOLOCATION_ACCURACY_METERS = 1_000;
export const HIGH_ACCURACY_GEOLOCATION_TIMEOUT_MS = 8_000;
export const FALLBACK_GEOLOCATION_TIMEOUT_MS = 10_000;
export const GEOLOCATION_MAXIMUM_AGE_MS = 60_000;
export const GEOLOCATION_NATIVE_TIMEOUT_BUFFER_MS = 1_000;

export type PreciseGeolocationErrorCode =
  | "CANCELLED"
  | "INACCURATE"
  | "PERMISSION_DENIED"
  | "POSITION_UNAVAILABLE"
  | "TIMEOUT"
  | "UNSUPPORTED";

export class PreciseGeolocationError extends Error {
  readonly code: PreciseGeolocationErrorCode;
  readonly accuracyMeters: number | null;

  constructor(
    code: PreciseGeolocationErrorCode,
    message: string,
    accuracyMeters: number | null = null
  ) {
    super(message);
    this.name = "PreciseGeolocationError";
    this.code = code;
    this.accuracyMeters = accuracyMeters;
  }
}

type GeolocationWatcher = Pick<Geolocation, "watchPosition" | "clearWatch">;

type PreciseGeolocationOptions = {
  preferredAccuracyMeters?: number;
  maximumAccuracyMeters?: number;
  highAccuracyTimeoutMs?: number;
  fallbackTimeoutMs?: number;
  maximumAgeMs?: number;
  nativeTimeoutBufferMs?: number;
  onAccuracyChange?: (accuracyMeters: number) => void;
};

export type PreciseGeolocationRequest = {
  promise: Promise<GeolocationPosition>;
  cancel: () => void;
};

type GeolocationPhase = "high-accuracy" | "fallback";
type TimeoutSource = "manual" | "native";

let nextRequestId = 1;

function isUsablePosition(position: GeolocationPosition) {
  const { latitude, longitude, accuracy } = position.coords;
  return (
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180 &&
    Number.isFinite(accuracy) &&
    accuracy >= 0
  );
}

function classifyGeolocationError(code: number): PreciseGeolocationErrorCode {
  if (code === 1) return "PERMISSION_DENIED";
  if (code === 2) return "POSITION_UNAVAILABLE";
  return "TIMEOUT";
}

function errorForCode(code: PreciseGeolocationErrorCode) {
  if (code === "PERMISSION_DENIED") {
    return new PreciseGeolocationError(
      code,
      "A permissão de localização foi negada. Libere o acesso nas configurações do navegador."
    );
  }

  if (code === "POSITION_UNAVAILABLE") {
    return new PreciseGeolocationError(
      code,
      "Não foi possível determinar sua localização atual. Toque em Atualizar localização para tentar novamente."
    );
  }

  return new PreciseGeolocationError(
    "TIMEOUT",
    "A localização demorou muito para responder. Toque em Atualizar localização para tentar novamente."
  );
}

export function requestPreciseGeolocation(
  geolocation: GeolocationWatcher,
  options: PreciseGeolocationOptions = {}
): PreciseGeolocationRequest {
  const requestId = nextRequestId++;
  const startedAt = Date.now();
  const preferredAccuracyMeters =
    options.preferredAccuracyMeters ?? PREFERRED_GEOLOCATION_ACCURACY_METERS;
  const maximumAccuracyMeters =
    options.maximumAccuracyMeters ?? MAXIMUM_GEOLOCATION_ACCURACY_METERS;
  const highAccuracyTimeoutMs =
    options.highAccuracyTimeoutMs ?? HIGH_ACCURACY_GEOLOCATION_TIMEOUT_MS;
  const fallbackTimeoutMs =
    options.fallbackTimeoutMs ?? FALLBACK_GEOLOCATION_TIMEOUT_MS;
  const maximumAgeMs = options.maximumAgeMs ?? GEOLOCATION_MAXIMUM_AGE_MS;
  const nativeTimeoutBufferMs =
    options.nativeTimeoutBufferMs ?? GEOLOCATION_NATIVE_TIMEOUT_BUFFER_MS;

  let watchId: number | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let settled = false;
  let phaseSequence = 0;
  let activePhase: GeolocationPhase | null = null;
  let phaseStartedAt = 0;
  let bestPosition: GeolocationPosition | null = null;
  let resolvePromise!: (position: GeolocationPosition) => void;
  let rejectPromise!: (error: Error) => void;

  const elapsedMs = () => Date.now() - startedAt;

  function clearPhaseResources(reason: string) {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (watchId !== null) {
      logFuelGeolocationDev("geolocation_call_finished", {
        requestId,
        phase: activePhase,
        reason,
        callElapsedMs: Date.now() - phaseStartedAt,
        requestElapsedMs: elapsedMs(),
      });
      logFuelGeolocationDev("watch_cleared", {
        requestId,
        watchId,
        reason,
        elapsedMs: elapsedMs(),
      });
      geolocation.clearWatch(watchId);
      watchId = null;
      activePhase = null;
    }
  }

  function resolveWith(position: GeolocationPosition, phase: GeolocationPhase) {
    if (settled) {
      logFuelGeolocationDev("late_resolution_ignored", { requestId, phase });
      return;
    }
    settled = true;
    clearPhaseResources("resolved");
    logFuelGeolocationDev("geolocation_request_succeeded", {
      requestId,
      phase,
      elapsedMs: elapsedMs(),
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
    });
    resolvePromise(position);
  }

  function rejectWith(error: Error, phase: GeolocationPhase | "request") {
    if (settled) {
      logFuelGeolocationDev("late_rejection_ignored", {
        requestId,
        phase,
        error: error.message,
      });
      return;
    }
    settled = true;
    clearPhaseResources("rejected");
    logFuelGeolocationDev("geolocation_request_failed", {
      requestId,
      phase,
      elapsedMs: elapsedMs(),
      code: error instanceof PreciseGeolocationError ? error.code : undefined,
      message: error.message,
    });
    rejectPromise(error);
  }

  const promise = new Promise<GeolocationPosition>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  function finishTimeout(phase: GeolocationPhase, source: TimeoutSource) {
    logFuelGeolocationDev("geolocation_timeout", {
      requestId,
      phase,
      source,
      elapsedMs: elapsedMs(),
      bestAccuracy: bestPosition?.coords.accuracy ?? null,
    });

    if (phase === "high-accuracy") {
      startPhase("fallback");
      return;
    }

    if (bestPosition) {
      const bestAccuracyMeters = Math.round(bestPosition.coords.accuracy);
      rejectWith(
        new PreciseGeolocationError(
          "INACCURATE",
          `A localização recebida não foi utilizável (precisão aproximada de ${bestAccuracyMeters} metros). Toque em Atualizar localização para tentar novamente.`,
          bestAccuracyMeters
        ),
        phase
      );
      return;
    }

    rejectWith(errorForCode("TIMEOUT"), phase);
  }

  function startPhase(phase: GeolocationPhase) {
    if (settled) return;

    clearPhaseResources(`start-${phase}`);
    const sequence = ++phaseSequence;
    activePhase = phase;
    phaseStartedAt = Date.now();
    const phaseTimeoutMs =
      phase === "high-accuracy" ? highAccuracyTimeoutMs : fallbackTimeoutMs;
    const positionOptions: PositionOptions = {
      enableHighAccuracy: phase === "high-accuracy",
      maximumAge: maximumAgeMs,
      timeout: Math.max(1, phaseTimeoutMs - nativeTimeoutBufferMs),
    };

    logFuelGeolocationDev("geolocation_call_started", {
      requestId,
      phase,
      elapsedMs: elapsedMs(),
      options: positionOptions,
      manualTimeoutMs: phaseTimeoutMs,
    });

    timeoutId = setTimeout(() => {
      if (settled || sequence !== phaseSequence) return;
      finishTimeout(phase, "manual");
    }, phaseTimeoutMs);

    try {
      const currentWatchId = geolocation.watchPosition(
        (position) => {
          if (settled || sequence !== phaseSequence) {
            logFuelGeolocationDev("late_position_callback_ignored", {
              requestId,
              phase,
              elapsedMs: elapsedMs(),
            });
            return;
          }

          logFuelGeolocationDev("geolocation_success_callback", {
            requestId,
            phase,
            elapsedMs: elapsedMs(),
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });

          if (!isUsablePosition(position)) {
            logFuelGeolocationDev("invalid_position_ignored", { requestId, phase });
            return;
          }

          if (!bestPosition || position.coords.accuracy < bestPosition.coords.accuracy) {
            bestPosition = position;
          }
          options.onAccuracyChange?.(position.coords.accuracy);

          if (position.coords.accuracy <= maximumAccuracyMeters) {
            resolveWith(position, phase);
            return;
          }

          logFuelGeolocationDev("position_waiting_for_reasonable_accuracy", {
            requestId,
            phase,
            accuracy: position.coords.accuracy,
            preferredAccuracyMeters,
            maximumAccuracyMeters,
          });
        },
        (error) => {
          if (settled || sequence !== phaseSequence) {
            logFuelGeolocationDev("late_error_callback_ignored", {
              requestId,
              phase,
              errorCode: error.code,
              errorMessage: error.message,
            });
            return;
          }

          const classification = classifyGeolocationError(error.code);
          logFuelGeolocationDev("geolocation_error_callback", {
            requestId,
            phase,
            elapsedMs: elapsedMs(),
            errorCode: error.code,
            errorMessage: error.message,
            classification,
          });

          if (classification === "PERMISSION_DENIED") {
            rejectWith(errorForCode(classification), phase);
          } else if (classification === "TIMEOUT") {
            finishTimeout(phase, "native");
          } else if (phase === "high-accuracy") {
            startPhase("fallback");
          } else {
            rejectWith(errorForCode(classification), phase);
          }
        },
        positionOptions
      );

      if (settled || sequence !== phaseSequence) {
        geolocation.clearWatch(currentWatchId);
      } else {
        watchId = currentWatchId;
      }
    } catch (error) {
      logFuelGeolocationDev("geolocation_call_threw", {
        requestId,
        phase,
        elapsedMs: elapsedMs(),
        message: error instanceof Error ? error.message : String(error),
      });
      if (phase === "high-accuracy") {
        startPhase("fallback");
      } else {
        rejectWith(errorForCode("POSITION_UNAVAILABLE"), phase);
      }
    }
  }

  logFuelGeolocationDev("geolocation_request_created", {
    requestId,
    preferredAccuracyMeters,
    maximumAccuracyMeters,
  });
  startPhase("high-accuracy");

  return {
    promise,
    cancel() {
      logFuelGeolocationDev("geolocation_request_cancelled", {
        requestId,
        elapsedMs: elapsedMs(),
      });
      rejectWith(
        new PreciseGeolocationError(
          "CANCELLED",
          "A busca de localização foi cancelada."
        ),
        "request"
      );
    },
  };
}
