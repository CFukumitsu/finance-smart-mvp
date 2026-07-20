"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  PreciseGeolocationError,
  requestPreciseGeolocation,
} from "@/src/utils/preciseGeolocation";
import { logFuelGeolocationDev } from "@/src/utils/fuelGeolocationDiagnostics";

export function useGeolocation() {
  const [isLocating, setIsLocating] = useState(false);
  const activeRequestRef = useRef<ReturnType<typeof requestPreciseGeolocation> | null>(null);
  const mountedRef = useRef(true);

  const cancelPosition = useCallback(() => {
    logFuelGeolocationDev("location_cancel_requested", {
      hasActiveRequest: activeRequestRef.current !== null,
      reason: "consumer",
    });
    activeRequestRef.current?.cancel();
    activeRequestRef.current = null;
    if (mountedRef.current) setIsLocating(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      logFuelGeolocationDev("geolocation_component_unmounted", {
        hasActiveRequest: activeRequestRef.current !== null,
        action: activeRequestRef.current ? "cancel-active-request" : "none",
      });
      activeRequestRef.current?.cancel();
      activeRequestRef.current = null;
    };
  }, []);

  const getPosition = useCallback(async (options?: {
    onAccuracyChange?: (accuracyMeters: number) => void;
  }) => {
    logFuelGeolocationDev("location_update_started", {
      isSecureContext: globalThis.isSecureContext,
      protocol: globalThis.location?.protocol ?? null,
      hostname: globalThis.location?.hostname ?? null,
      geolocationAvailable: Boolean(navigator.geolocation),
      permissionsAvailable: Boolean(navigator.permissions?.query),
      hadActiveRequest: activeRequestRef.current !== null,
    });

    if (navigator.permissions?.query) {
      void navigator.permissions
        .query({ name: "geolocation" })
        .then((permission) => {
          logFuelGeolocationDev("geolocation_permission_state", {
            state: permission.state,
          });
        })
        .catch((error) => {
          logFuelGeolocationDev("geolocation_permission_query_failed", {
            message: error instanceof Error ? error.message : String(error),
            action: "request-continues-without-permission-query",
          });
        });
    }

    if (globalThis.isSecureContext === false) {
      throw new PreciseGeolocationError(
        "POSITION_UNAVAILABLE",
        "A localização do dispositivo exige uma conexão HTTPS segura."
      );
    }

    if (!navigator.geolocation) {
      throw new PreciseGeolocationError(
        "UNSUPPORTED",
        "A geolocalização não é suportada neste navegador."
      );
    }

    if (activeRequestRef.current) {
      logFuelGeolocationDev("active_request_replaced", {
        action: "cancel-previous-and-start-new",
      });
      activeRequestRef.current.cancel();
    }
    const request = requestPreciseGeolocation(navigator.geolocation, options);
    activeRequestRef.current = request;
    setIsLocating(true);

    try {
      return await request.promise;
    } finally {
      if (activeRequestRef.current === request) {
        activeRequestRef.current = null;
        logFuelGeolocationDev("location_request_lock_released", {
          mounted: mountedRef.current,
        });
        if (mountedRef.current) setIsLocating(false);
      } else {
        logFuelGeolocationDev("stale_request_finally_ignored", {
          hasNewerRequest: activeRequestRef.current !== null,
        });
      }
    }
  }, []);

  return { getPosition, cancelPosition, isLocating };
}
