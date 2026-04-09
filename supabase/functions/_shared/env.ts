export function getAeroApiKey(): string {
  // @ts-expect-error Deno
  const k =
    Deno.env.get('FLIGHTAWARE_AEROAPI_KEY') ??
    Deno.env.get('FLIGHTAWARE_API_KEY') ??
    '';
  return k;
}

export function getAeroBaseUrl(): string {
  // @ts-expect-error Deno
  return (Deno.env.get('FLIGHTAWARE_AEROAPI_BASE_URL') ?? 'https://aeroapi.flightaware.com/aeroapi').replace(
    /\/+$/,
    '',
  );
}
