export type GooglePlace = { address_components?: Array<{ types?: string[]; long_name?: string; short_name?: string }>; formatted_address?: string; place_id?: string };
export type GoogleAutocomplete = { getPlace: () => GooglePlace; addListener: (event: string, callback: () => void) => { remove: () => void } };
export type GoogleLatLng = { lat: number | (() => number); lng: number | (() => number) };
export type GoogleMap = { fitBounds: (bounds: GoogleBounds) => void };
export type GoogleBounds = { extend: (point: GoogleLatLng) => void };
export type GoogleGeocoder = { geocode: (request: { address: string }, callback: (results: Array<{ geometry: { location: GoogleLatLng } }>, status: string) => void) => void };
export type GoogleMarker = { setMap: (map: GoogleMap | null) => void };
export type GooglePolyline = { setMap: (map: GoogleMap | null) => void };
export type GoogleMapsApi = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMap;
  Geocoder: new () => GoogleGeocoder;
  Marker: new (options: Record<string, unknown>) => GoogleMarker;
  Polyline: new (options: Record<string, unknown>) => GooglePolyline;
  LatLngBounds: new () => GoogleBounds;
  places?: { Autocomplete: new (input: HTMLInputElement, options: object) => GoogleAutocomplete };
};

declare global {
  interface Window {
    google?: { maps?: GoogleMapsApi };
  }
}

