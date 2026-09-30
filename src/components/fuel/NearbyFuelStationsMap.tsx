"use client";

import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import type { NearbyFuelStation } from "@/src/types/fuel";
import {
  calculateViewportSearchArea,
  type FuelStationSearchArea,
  hasSearchAreaChangedRelevantly,
  isSearchAreaCovered,
} from "@/src/utils/fuelStationProximity";

type Coordinates = { lat: number; lng: number };

type GoogleMapsEventListener = {
  remove: () => void;
};

type GoogleLatLng = {
  lat: () => number;
  lng: () => number;
};

type GoogleMap = {
  fitBounds: (bounds: unknown, padding?: number) => void;
  panTo: (position: Coordinates) => void;
  getCenter: () => GoogleLatLng | undefined;
  getBounds: () => { getNorthEast: () => GoogleLatLng } | undefined;
  getZoom: () => number | undefined;
  setZoom: (zoom: number) => void;
  addListener: (event: string, handler: () => void) => GoogleMapsEventListener;
};

type GoogleMarker = {
  setMap: (map: GoogleMap | null) => void;
};

type GoogleMapsApi = {
  Map: new (
    element: HTMLElement,
    options: { center: Coordinates; zoom: number; mapTypeControl: boolean },
  ) => GoogleMap;
  Marker: new (options: {
    map: GoogleMap;
    position: Coordinates;
    title: string;
    zIndex?: number;
    icon?: {
      path: unknown;
      fillColor: string;
      fillOpacity: number;
      strokeColor: string;
      strokeWeight: number;
      scale: number;
    };
  }) => GoogleMarker & {
    addListener: (event: string, handler: () => void) => void;
  };
  LatLngBounds: new () => { extend: (position: Coordinates) => void };
  SymbolPath: { CIRCLE: unknown };
};

declare global {
  interface Window {
    google?: { maps: GoogleMapsApi };
  }
}

type Props = {
  userLocation: { latitude: number; longitude: number };
  places: NearbyFuelStation[];
  highlightedPlaceId: string | null;
  registeredPlaceIds: Set<string>;
  onHighlight: (googlePlaceId: string) => void;
  onSelect: (place: NearbyFuelStation) => void;
  searchedAreas: FuelStationSearchArea[];
  onSearchArea: (area: FuelStationSearchArea) => Promise<boolean>;
  selectingPlaceId: string | null;
  isSearchingArea: boolean;
};

function readViewportArea(map: GoogleMap) {
  const center = map.getCenter();
  const northEast = map.getBounds()?.getNorthEast();
  if (!center || !northEast) return null;

  return calculateViewportSearchArea(
    { latitude: center.lat(), longitude: center.lng() },
    { latitude: northEast.lat(), longitude: northEast.lng() },
  );
}

function formatDistance(distanceMeters: number | null) {
  if (distanceMeters === null) return "Distância não informada";
  if (distanceMeters < 1000) return `Aproximadamente ${distanceMeters} m`;
  return `Aproximadamente ${(distanceMeters / 1000).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  })} km`;
}

export default function NearbyFuelStationsMap({
  userLocation,
  places,
  highlightedPlaceId,
  registeredPlaceIds,
  onHighlight,
  onSelect,
  searchedAreas,
  onSearchArea,
  selectingPlaceId,
  isSearchingArea,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const markersRef = useRef<GoogleMarker[]>([]);
  const mapListenersRef = useRef<GoogleMapsEventListener[]>([]);
  const hasInitialViewportRef = useRef(false);
  // Movimentos feitos pelo código (enquadramento inicial, destaque de posto)
  // não devem oferecer "Buscar nesta área".
  const programmaticMoveRef = useRef(true);

  const [apiKey, setApiKey] = useState("");
  const [mapError, setMapError] = useState("");
  const [isScriptReady, setIsScriptReady] = useState(false);
  // Área visível após o último movimento do usuário.
  const [viewportArea, setViewportArea] =
    useState<FuelStationSearchArea | null>(null);
  // Enquadramentos já pesquisados (inicial + cada "Buscar nesta área").
  const [referenceAreas, setReferenceAreas] = useState<
    FuelStationSearchArea[]
  >([]);

  const highlightedPlace = useMemo(
    () =>
      places.find((place) => place.googlePlaceId === highlightedPlaceId) ??
      null,
    [highlightedPlaceId, places],
  );

  const showSearchAreaButton =
    viewportArea !== null &&
    // Sem áreas pesquisadas (erro na busca inicial ou posto já selecionado),
    // qualquer movimento volta a oferecer a busca.
    (searchedAreas.length === 0 ||
      referenceAreas.every((reference) =>
        hasSearchAreaChangedRelevantly(reference, viewportArea),
      )) &&
    !isSearchAreaCovered(viewportArea, searchedAreas);

  async function handleSearchArea() {
    const map = mapRef.current;
    const area = (map && readViewportArea(map)) ?? viewportArea;
    if (!area || isSearchingArea) return;

    if (await onSearchArea(area)) {
      setReferenceAreas((current) => [...current, area]);
    }
  }

  useEffect(() => {
    let cancelled = false;

    fetch("/api/maps/browser-config", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as {
          apiKey?: string;
          error?: string;
        };
        if (!response.ok || !data.apiKey) {
          throw new Error(data.error || "Mapa indisponível.");
        }
        if (!cancelled) setApiKey(data.apiKey);
      })
      .catch(() => {
        if (!cancelled) {
          setMapError(
            "O mapa não pôde ser carregado. Você ainda pode usar a lista.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const maps = window.google?.maps;
    const container = containerRef.current;

    if (!isScriptReady || !maps || !container || mapRef.current) {
      return;
    }

    const userPosition = {
      lat: userLocation.latitude,
      lng: userLocation.longitude,
    };

    const map = new maps.Map(container, {
      center: userPosition,
      zoom: 15,
      mapTypeControl: false,
    });

    mapRef.current = map;

    mapListenersRef.current.push(
      map.addListener("dragstart", () => {
        programmaticMoveRef.current = false;
      }),
    );

    // "idle" dispara uma única vez quando o mapa para de se mover (arrasto,
    // zoom por botão, pinça ou roda do mouse), então não há consulta por pixel.
    // Aqui só se lê a área visível; a API é chamada apenas pelo botão.
    mapListenersRef.current.push(
      map.addListener("idle", () => {
        const area = readViewportArea(map);
        if (!area) return;

        if (programmaticMoveRef.current) {
          programmaticMoveRef.current = false;
          if (hasInitialViewportRef.current) {
            setReferenceAreas((current) =>
              current.length === 0 ? [area] : current,
            );
          }
          // Após o destaque de um posto, reavalia o botão na área realmente
          // exibida, sem fazê-lo surgir se o usuário ainda não moveu o mapa.
          setViewportArea((current) => current && area);
          return;
        }

        setViewportArea(area);
      }),
    );

    return () => {
      mapListenersRef.current.forEach((listener) => listener.remove());
      mapListenersRef.current = [];
      mapRef.current = null;
    };
  }, [isScriptReady, userLocation.latitude, userLocation.longitude]);

  useEffect(() => {
    const maps = window.google?.maps;
    const container = containerRef.current;
    if (!isScriptReady || !maps || !container) return;

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];

    const userPosition = {
      lat: userLocation.latitude,
      lng: userLocation.longitude,
    };
    const map = mapRef.current;

    if (!map) {
      return;
    }

    const bounds = new maps.LatLngBounds();
    bounds.extend(userPosition);

    markersRef.current.push(
      new maps.Marker({
        map,
        position: userPosition,
        title: "Sua localização",
        zIndex: 1000,
        icon: {
          path: maps.SymbolPath.CIRCLE,
          fillColor: "#38bdf8",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
          scale: 8,
        },
      }),
    );

    for (const place of places) {
      if (place.latitude === null || place.longitude === null) continue;
      const position = { lat: place.latitude, lng: place.longitude };
      const isHighlighted = place.googlePlaceId === highlightedPlaceId;
      const isRegistered = registeredPlaceIds.has(place.googlePlaceId);
      const marker = new maps.Marker({
        map,
        position,
        title: place.name,
        zIndex: isHighlighted ? 500 : 1,
        icon: {
          path: maps.SymbolPath.CIRCLE,
          fillColor: isRegistered
            ? "#10b981"
            : isHighlighted
              ? "#f59e0b"
              : "#f97316",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: isHighlighted ? 4 : 2,
          scale: isHighlighted ? 11 : 8,
        },
      });
      marker.addListener("click", () => onHighlight(place.googlePlaceId));
      markersRef.current.push(marker);
      bounds.extend(position);
    }

    if (!hasInitialViewportRef.current) {
      map.fitBounds(bounds, 48);
      map.panTo(userPosition);

      if ((map.getZoom() ?? 0) < 14) {
        map.setZoom(14);
      }

      hasInitialViewportRef.current = true;
    }
  }, [
    highlightedPlaceId,
    isScriptReady,
    onHighlight,
    places,
    registeredPlaceIds,
    userLocation,
  ]);

  useEffect(() => {
    if (
      !mapRef.current ||
      !highlightedPlace ||
      highlightedPlace.latitude === null ||
      highlightedPlace.longitude === null
    ) {
      return;
    }

    programmaticMoveRef.current = true;
    mapRef.current.panTo({
      lat: highlightedPlace.latitude,
      lng: highlightedPlace.longitude,
    });
    if ((mapRef.current.getZoom() ?? 0) < 16) mapRef.current.setZoom(16);
  }, [highlightedPlace]);

  if (mapError) {
    return (
      <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 p-4 text-sm text-amber-100">
        {mapError}
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-3">
      <div className="relative">
        <div
          ref={containerRef}
          className="h-[clamp(16rem,42vh,28rem)] w-full overflow-hidden rounded-xl bg-slate-800"
          aria-label="Mapa dos postos próximos"
        />

        <div
          className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-full"
          aria-hidden="true"
        >
          <div className="flex flex-col items-center">
            <div className="rounded-full border-2 border-white bg-cyan-500 p-1.5 shadow-lg">
              <div className="h-2.5 w-2.5 rounded-full bg-white" />
            </div>

            <div className="h-3 w-0.5 bg-white shadow" />
          </div>
        </div>

        {/* Topo central: livre dos controles do Google (tela cheia no canto
            superior direito, zoom no inferior direito) e do pino central. */}
        {showSearchAreaButton && (
          <button
            type="button"
            onClick={handleSearchArea}
            disabled={isSearchingArea}
            className="absolute left-1/2 top-3 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-black/40 hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-80"
          >
            {isSearchingArea ? "Buscando..." : "Buscar nesta área"}
          </button>
        )}
      </div>

      {!isScriptReady && (
        <p className="text-sm text-slate-400">Carregando mapa...</p>
      )}
      {highlightedPlace && (
        <div className="rounded-xl border border-amber-400/30 bg-slate-950 p-3">
          <p className="font-semibold text-white">{highlightedPlace.name}</p>
          <p className="mt-1 text-xs text-slate-400">
            {highlightedPlace.formattedAddress ||
              "Endereço não informado pelo Google"}
          </p>
          <p className="mt-1 text-xs font-medium text-cyan-300">
            {formatDistance(highlightedPlace.distanceMeters)}
          </p>
          {registeredPlaceIds.has(highlightedPlace.googlePlaceId) && (
            <p className="mt-1 text-xs font-semibold text-emerald-300">
              Já cadastrado
            </p>
          )}
          <button
            type="button"
            onClick={() => onSelect(highlightedPlace)}
            disabled={selectingPlaceId !== null}
            className="mt-3 w-full rounded-lg border border-cyan-400/30 px-3 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/10 disabled:opacity-50"
          >
            {selectingPlaceId === highlightedPlace.googlePlaceId
              ? "Carregando..."
              : registeredPlaceIds.has(highlightedPlace.googlePlaceId)
                ? "Carregar cadastro"
                : "Selecionar"}
          </button>
        </div>
      )}
      {apiKey && (
        <Script
          id="google-maps-browser"
          src={`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`}
          strategy="afterInteractive"
          onReady={() => setIsScriptReady(true)}
          onError={() =>
            setMapError(
              "O mapa não pôde ser carregado. Você ainda pode usar a lista.",
            )
          }
        />
      )}
    </div>
  );
}
