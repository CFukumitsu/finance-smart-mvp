"use client";
import { useState } from "react";

export function useGeolocation() {
  const [isLocating, setIsLocating] = useState(false);
  const getPosition = () => new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("A geolocalização não é suportada neste navegador."));
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => { setIsLocating(false); resolve(position); },
      (error) => {
        setIsLocating(false);

        if (error.code === error.PERMISSION_DENIED) {
          reject(new Error("A permissão de localização foi negada. Libere o acesso nas configurações do navegador."));
          return;
        }

        if (error.code === error.POSITION_UNAVAILABLE) {
          reject(new Error("Não foi possível determinar sua localização atual."));
          return;
        }

        if (error.code === error.TIMEOUT) {
          reject(new Error("A localização demorou muito para responder. Tente novamente."));
          return;
        }

        reject(new Error("Não foi possível obter sua localização."));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  });
  return { getPosition, isLocating };
}
