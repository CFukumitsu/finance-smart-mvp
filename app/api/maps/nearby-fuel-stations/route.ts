import { NextRequest, NextResponse } from "next/server";

type GooglePlace = {
  id?: string;
  displayName?: {
    text?: string;
    languageCode?: string;
  };
  formattedAddress?: string;
  shortFormattedAddress?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  primaryType?: string;
  googleMapsUri?: string;
};

type GoogleNearbyResponse = {
  places?: GooglePlace[];
};

function parseCoordinate(
  value: string | null,
  minimum: number,
  maximum: number
) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);

  if (
    !Number.isFinite(parsed) ||
    parsed < minimum ||
    parsed > maximum
  ) {
    return null;
  }

  return parsed;
}

export async function GET(request: NextRequest) {
  try {
    const latitude = parseCoordinate(
      request.nextUrl.searchParams.get("lat"),
      -90,
      90
    );

    const longitude = parseCoordinate(
      request.nextUrl.searchParams.get("lng"),
      -180,
      180
    );

    const requestedRadius = Number(
      request.nextUrl.searchParams.get("radius") ?? "500"
    );

    const radius = Math.min(
      Math.max(
        Number.isFinite(requestedRadius)
          ? requestedRadius
          : 500,
        50
      ),
      5000
    );

    if (latitude === null || longitude === null) {
      return NextResponse.json(
        {
          error: "Latitude ou longitude inválida.",
        },
        {
          status: 400,
        }
      );
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error: "Google Maps não configurado no servidor.",
        },
        {
          status: 500,
        }
      );
    }

    const googleResponse = await fetch(
      "https://places.googleapis.com/v1/places:searchNearby",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": [
            "places.id",
            "places.displayName",
            "places.formattedAddress",
            "places.shortFormattedAddress",
            "places.location",
            "places.rating",
            "places.userRatingCount",
            "places.businessStatus",
            "places.primaryType",
            "places.googleMapsUri",
          ].join(","),
        },
        body: JSON.stringify({
          includedTypes: ["gas_station"],
          maxResultCount: 10,
          rankPreference: "DISTANCE",
          locationRestriction: {
            circle: {
              center: {
                latitude,
                longitude,
              },
              radius,
            },
          },
          languageCode: "pt-BR",
          regionCode: "BR",
        }),
        cache: "no-store",
      }
    );

    const googleData =
      (await googleResponse.json()) as GoogleNearbyResponse & {
        error?: {
          message?: string;
          status?: string;
        };
      };

    if (!googleResponse.ok) {
      console.error(
        "Erro do Nearby Search:",
        googleData.error
      );

      return NextResponse.json(
        {
          error:
            googleData.error?.message ??
            "Não foi possível localizar postos próximos.",
        },
        {
          status: googleResponse.status,
        }
      );
    }

    const places = (googleData.places ?? []).map((place) => ({
      googlePlaceId: place.id ?? "",
      name: place.displayName?.text ?? "Posto sem nome",
      formattedAddress:
        place.formattedAddress ??
        place.shortFormattedAddress ??
        "",
      latitude: place.location?.latitude ?? null,
      longitude: place.location?.longitude ?? null,
      rating: place.rating ?? null,
      userRatingCount: place.userRatingCount ?? 0,
      businessStatus: place.businessStatus ?? null,
      primaryType: place.primaryType ?? null,
      googleMapsUri: place.googleMapsUri ?? null,
    }));

    return NextResponse.json({
      places,
    });
  } catch (error) {
    console.error(
      "Erro ao buscar postos próximos:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao buscar postos próximos.",
      },
      {
        status: 500,
      }
    );
  }
}