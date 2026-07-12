"use client";
import { useState } from "react";

export function useGeolocation() {
  const [isLocating, setIsLocating] = useState(false);
  const getPosition = () => new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error("Geolocalização não disponível.")); return; }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => { setIsLocating(false); resolve(position); },
      () => { setIsLocating(false); reject(new Error("Não foi possível obter sua localização.")); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
  return { getPosition, isLocating };
}
