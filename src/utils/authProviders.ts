export function isGoogleProviderEnabled(settings: unknown) {
  if (!settings || typeof settings !== "object") return false;
  const external = (settings as { external?: unknown }).external;
  if (!external || typeof external !== "object") return false;
  return (external as { google?: unknown }).google === true;
}

