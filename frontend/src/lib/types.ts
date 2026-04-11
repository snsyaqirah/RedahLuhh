export type WeatherStatus = "green" | "yellow" | "red";

export interface WeatherCondition {
  status: WeatherStatus;
  label: string;
  description: string;
  temperature: number;
  feels_like: number;
  humidity: number;
  wind_speed: number;
  precipitation_prob: number;  // 0.0 – 1.0
  weather_code: number;
  icon_code: string;           // emoji
}

export interface Waypoint {
  index: number;
  lat: number;
  lng: number;
  label: string;
  eta: string;                      // ISO-8601 datetime string
  distance_from_start_km: number;
  weather: WeatherCondition;
}

export interface RouteInfo {
  total_distance_km: number;
  total_duration_minutes: number;
  encoded_polyline: string;
}

export interface RouteWeatherResponse {
  route_index: number;
  route_label: string;      // "Driest Route" | "Fastest Route" | "Recommended" | "Alternative Route N"
  is_recommended: boolean;
  weather_score: number;    // lower = better
  route: RouteInfo;
  waypoints: Waypoint[];
  overall_status: WeatherStatus;
  overall_label: string;
  summary: string;
  alerts: string[];
  met_warnings: string[];
  departure_time: string;
  last_updated: string;
}

export interface MultiRouteWeatherResponse {
  routes: RouteWeatherResponse[];
  recommended_index: number;
}

export interface RouteWeatherRequest {
  origin: string;
  destination: string;
  departure_time?: string;
}
