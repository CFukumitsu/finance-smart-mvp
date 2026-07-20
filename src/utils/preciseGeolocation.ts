export const PREFERRED_GEOLOCATION_ACCURACY_METERS = 100;
export const MAXIMUM_GEOLOCATION_ACCURACY_METERS = 300;
export const PRECISE_GEOLOCATION_TIMEOUT_MS = 20_000;

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
  timeoutMs?: number;
  onAccuracyChange?: (accuracyMeters: number) => void;
};

export type PreciseGeolocationRequest = {
  promise: Promise<GeolocationPosition>;
  cancel: () => void;
};

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

export function requestPreciseGeolocation(
  geolocation: GeolocationWatcher,
  options: PreciseGeolocationOptions = {}
): PreciseGeolocationRequest {
  const preferredAccuracyMeters =
    options.preferredAccuracyMeters ?? PREFERRED_GEOLOCATION_ACCURACY_METERS;
  const maximumAccuracyMeters =
    options.maximumAccuracyMeters ?? MAXIMUM_GEOLOCATION_ACCURACY_METERS;
  const timeoutMs = options.timeoutMs ?? PRECISE_GEOLOCATION_TIMEOUT_MS;

  let watchId: number | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let settled = false;
  let bestPosition: GeolocationPosition | null = null;
  let lastError: GeolocationPositionError | null = null;
  let resolvePromise!: (position: GeolocationPosition) => void;
  let rejectPromise!: (error: Error) => void;

  function clearResources() {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (watchId !== null) {
      geolocation.clearWatch(watchId);
      watchId = null;
    }
  }

  function resolveWith(position: GeolocationPosition) {
    if (settled) return;
    settled = true;
    clearResources();
    resolvePromise(position);
  }

  function rejectWith(error: Error) {
    if (settled) return;
    settled = true;
    clearResources();
    rejectPromise(error);
  }

  const promise = new Promise<GeolocationPosition>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  timeoutId = setTimeout(() => {
    if (
      bestPosition &&
      bestPosition.coords.accuracy <= maximumAccuracyMeters
    ) {
      resolveWith(bestPosition);
      return;
    }

    if (bestPosition) {
      const bestAccuracyMeters = Math.round(bestPosition.coords.accuracy);
      rejectWith(
        new PreciseGeolocationError(
          "INACCURATE",
          `Não foi possível obter uma localização precisa. Melhor precisão recebida: ${bestAccuracyMeters} metros. Ative a localização precisa para o Chrome e para este site, vá para um local aberto e toque em Atualizar localização.`,
          bestAccuracyMeters
        )
      );
      return;
    }

    const unavailable =
      lastError !== null && lastError.code === lastError.POSITION_UNAVAILABLE;
    rejectWith(
      new PreciseGeolocationError(
        unavailable ? "POSITION_UNAVAILABLE" : "TIMEOUT",
        unavailable
          ? "Não foi possível determinar sua localização atual. Vá para um local aberto e toque em Atualizar localização."
          : "A localização demorou muito para responder. Toque em Atualizar localização para tentar novamente."
      )
    );
  }, timeoutMs);

  try {
    watchId = geolocation.watchPosition(
      (position) => {
        if (settled || !isUsablePosition(position)) return;

        if (
          !bestPosition ||
          position.coords.accuracy < bestPosition.coords.accuracy
        ) {
          bestPosition = position;
        }

        options.onAccuracyChange?.(position.coords.accuracy);

        if (position.coords.accuracy <= preferredAccuracyMeters) {
          resolveWith(position);
        }
      },
      (error) => {
        if (settled) return;
        lastError = error;

        if (error.code === error.PERMISSION_DENIED) {
          rejectWith(
            new PreciseGeolocationError(
              "PERMISSION_DENIED",
              "A permissão de localização foi negada. Libere o acesso nas configurações do navegador."
            )
          );
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: timeoutMs,
      }
    );

    if (settled && watchId !== null) {
      geolocation.clearWatch(watchId);
      watchId = null;
    }
  } catch {
    rejectWith(
      new PreciseGeolocationError(
        "POSITION_UNAVAILABLE",
        "Não foi possível iniciar a localização neste navegador."
      )
    );
  }

  return {
    promise,
    cancel() {
      rejectWith(
        new PreciseGeolocationError(
          "CANCELLED",
          "A busca de localização foi cancelada."
        )
      );
    },
  };
}
