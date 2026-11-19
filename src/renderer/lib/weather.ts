// Weather via Open-Meteo (free, no API key). Cached for 15 minutes per city.
import { useEffect, useState } from 'react';
import { useSettings } from './hooks';

export interface WeatherData {
  current: { temp: number; feels: number; code: number; wind: number; humidity: number; isDay: boolean; pressure: number; uv: number | null; visibility: number | null };
  hourly: { time: number; temp: number; code: number; precip: number }[];
  daily: { date: number; max: number; min: number; code: number; precip: number; sunrise: number; sunset: number }[];
  fetched: number;
}

export const WMO: Record<number, [string, string]> = {
  0: ['Clear', 'sun'], 1: ['Mostly Clear', 'sun'], 2: ['Partly Cloudy', 'cloud-sun'], 3: ['Cloudy', 'cloud'],
  45: ['Fog', 'fog'], 48: ['Freezing Fog', 'fog'], 51: ['Light Drizzle', 'drizzle'], 53: ['Drizzle', 'drizzle'], 55: ['Heavy Drizzle', 'drizzle'],
  56: ['Freezing Drizzle', 'drizzle'], 57: ['Freezing Drizzle', 'drizzle'], 61: ['Light Rain', 'rain'], 63: ['Rain', 'rain'], 65: ['Heavy Rain', 'rain'],
  66: ['Freezing Rain', 'rain'], 67: ['Freezing Rain', 'rain'], 71: ['Light Snow', 'snow'], 73: ['Snow', 'snow'], 75: ['Heavy Snow', 'snow'], 77: ['Snow Grains', 'snow'],
  80: ['Rain Showers', 'rain'], 81: ['Rain Showers', 'rain'], 82: ['Violent Showers', 'rain'], 85: ['Snow Showers', 'snow'], 86: ['Snow Showers', 'snow'],
  95: ['Thunderstorm', 'storm'], 96: ['Thunderstorm, Hail', 'storm'], 99: ['Thunderstorm, Hail', 'storm'],
};
export const wmoLabel = (c: number) => (WMO[c] || ['—', 'cloud'])[0];
export const wmoKind = (c: number) => (WMO[c] || ['—', 'cloud'])[1];

export async function geocode(q: string) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=en&format=json`);
  if (!r.ok) throw new Error('Geocoding failed');
  const j = await r.json();
  return ((j.results || []) as { name: string; latitude: number; longitude: number; country?: string; admin1?: string }[]).map((x) => ({ name: x.name, lat: x.latitude, lon: x.longitude, country: [x.admin1, x.country].filter(Boolean).join(', ') }));
}

export async function fetchWeather(lat: number, lon: number, units: 'metric' | 'imperial'): Promise<WeatherData> {
  const key = `wx:${lat.toFixed(2)},${lon.toFixed(2)},${units}`;
  try { const c = JSON.parse(localStorage.getItem(key) || 'null') as WeatherData | null; if (c && Date.now() - c.fetched < 15 * 60000) return c; } catch { /* ignore */ }
  const u = units === 'imperial' ? '&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch' : '';
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day,surface_pressure,uv_index,visibility&hourly=temperature_2m,weather_code,precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&timezone=auto&forecast_days=10&timeformat=unixtime${u}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Weather service error (${r.status})`);
  const j = await r.json();
  const now = Date.now() / 1000;
  const hi = (j.hourly.time as number[]).findIndex((t) => t >= now - 3600);
  const data: WeatherData = {
    current: { temp: j.current.temperature_2m, feels: j.current.apparent_temperature, code: j.current.weather_code, wind: j.current.wind_speed_10m, humidity: j.current.relative_humidity_2m, isDay: !!j.current.is_day, pressure: j.current.surface_pressure, uv: j.current.uv_index ?? null, visibility: j.current.visibility ?? null },
    hourly: (j.hourly.time as number[]).slice(Math.max(0, hi), Math.max(0, hi) + 24).map((t, i) => ({ time: t * 1000, temp: j.hourly.temperature_2m[hi + i], code: j.hourly.weather_code[hi + i], precip: j.hourly.precipitation_probability?.[hi + i] ?? 0 })),
    daily: (j.daily.time as number[]).map((t, i) => ({ date: t * 1000, max: j.daily.temperature_2m_max[i], min: j.daily.temperature_2m_min[i], code: j.daily.weather_code[i], precip: j.daily.precipitation_probability_max?.[i] ?? 0, sunrise: j.daily.sunrise[i] * 1000, sunset: j.daily.sunset[i] * 1000 })),
    fetched: Date.now(),
  };
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* ignore */ }
  return data;
}

export function useWeather() {
  const [s] = useSettings();
  const [data, setData] = useState<WeatherData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const city = s.weatherCity;
  useEffect(() => {
    if (!city) { setData(null); return; }
    let alive = true;
    const load = () => fetchWeather(city.lat, city.lon, s.weatherUnits).then((d) => { if (alive) { setData(d); setError(null); } }).catch((e: Error) => alive && setError(navigator.onLine ? e.message : 'Offline'));
    void load();
    const t = setInterval(load, 15 * 60000);
    return () => { alive = false; clearInterval(t); };
  }, [city?.lat, city?.lon, s.weatherUnits]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error, city, units: s.weatherUnits };
}
