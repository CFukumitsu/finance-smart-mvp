import { NextRequest, NextResponse } from "next/server";

type GoogleAddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

type GooglePlaceDetails = {
  id?: string;
  displayName?: {
    text?: string;
    languageCode?: string;
  };
  formattedAddress?: string;
  addressComponents?: GoogleAddressComponent[];
  location?: {
    latitude?: number;
    longitude?: number;
  };
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  primaryType?: string;
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
};

function findComponent(
  components: GoogleAddressComponent[] | undefined,
  type: string
) {
  return components?.find((component) =>
    component.types?.includes(type)
  );
}

export async function GET(request: NextRequest) {
  try {
    const placeId =
      request.nextUrl.searchParams.get("placeId")?.trim();

    if (!placeId) {
      return NextResponse.json(
        {
          error: "Place ID é obrigatório.",
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
      `https://places.googleapis.com/v1/places/${encodeURIComponent(
        placeId
      )}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": [
            "id",
            "displayName",
            "formattedAddress",
            "addressComponents",
            "location",
            "rating",
            "userRatingCount",
            "businessStatus",
            "primaryType",
            "googleMapsUri",
            "nationalPhoneNumber",
            "websiteUri",
          ].join(","),
        },
        cache: "no-store",
      }
    );

    const googleData =
      (await googleResponse.json()) as GooglePlaceDetails & {
        error?: {
          message?: string;
          status?: string;
        };
      };

    if (!googleResponse.ok) {
      console.error(
        "Erro do Place Details:",
        googleData.error
      );

      return NextResponse.json(
        {
          error:
            googleData.error?.message ??
            "Não foi possível carregar o posto.",
        },
        {
          status: googleResponse.status,
        }
      );
    }

    const route = findComponent(
      googleData.addressComponents,
      "route"
    );

    const streetNumber = findComponent(
      googleData.addressComponents,
      "street_number"
    );

    const neighborhood =
      findComponent(
        googleData.addressComponents,
        "sublocality_level_1"
      ) ??
      findComponent(
        googleData.addressComponents,
        "sublocality"
      ) ??
      findComponent(
        googleData.addressComponents,
        "neighborhood"
      );

    const city =
      findComponent(
        googleData.addressComponents,
        "administrative_area_level_2"
      ) ??
      findComponent(
        googleData.addressComponents,
        "locality"
      );

    const state = findComponent(
      googleData.addressComponents,
      "administrative_area_level_1"
    );

    const postalCode = findComponent(
      googleData.addressComponents,
      "postal_code"
    );

    const address = [
      route?.longText,
      streetNumber?.longText,
    ]
      .filter(Boolean)
      .join(", ");

    return NextResponse.json({
      googlePlaceId: googleData.id ?? placeId,
      name:
        googleData.displayName?.text ??
        "Posto sem nome",
      formattedAddress:
        googleData.formattedAddress ?? "",
      address,
      neighborhood:
        neighborhood?.longText ?? "",
      city:
        city?.longText ?? "",
      state:
        state?.shortText ?? "",
      postalCode:
        postalCode?.longText ?? "",
      latitude:
        googleData.location?.latitude ?? null,
      longitude:
        googleData.location?.longitude ?? null,
      rating:
        googleData.rating ?? null,
      userRatingCount:
        googleData.userRatingCount ?? 0,
      businessStatus:
        googleData.businessStatus ?? null,
      primaryType:
        googleData.primaryType ?? null,
      googleMapsUri:
        googleData.googleMapsUri ?? null,
      phone:
        googleData.nationalPhoneNumber ?? null,
      website:
        googleData.websiteUri ?? null,
    });
  } catch (error) {
    console.error(
      "Erro ao carregar detalhes do posto:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao carregar detalhes do posto.",
      },
      {
        status: 500,
      }
    );
  }
}