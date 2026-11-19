import { useState } from 'react';
import { Search, MapPin, Wind, Droplets, Gauge, Sunrise, Sunset, Eye, Thermometer, RefreshCw } from 'lucide-react';
import { Window } from '../components/Window';
import { useSettings } from '../lib/hooks';
import { geocode, useWeather, wmoLabel } from '../lib/weather';
import { WeatherIcon } from '../components/WeatherIcon';
import { Spinner } from '../components/ui';

export default function Weather() {
  const [s, update] = useSettings();
  const wx = useWeather();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<{ name: string; lat: number; lon: number; country?: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState('');
  const search = async (e: React.FormEvent) => {
    e.preventDefault(); if (!q.trim()) return;
    setSearching(true); setErr('');
    try { setRes(await geocode(q)); } catch (x) { setErr((x as Error).message); } finally { setSearching(false); }
  };
  const d = wx.data;
  const unit = s.weatherUnits === 'imperial' ? { t: '°F', w: 'mph' } : { t: '°C', w: 'km/h' };
  const bg = d ? (d.current.isDay ? 'linear-gradient(170deg,#3f8fe6 0%,#2a64c6 55%,#1d4aa0 100%)' : 'linear-gradient(170deg,#121a3a 0%,#0b1029 60%,#060918 100%)') : 'linear-gradient(170deg,#3f8fe6,#1d4aa0)';
  const tMin = d ? Math.min(...d.daily.map((x) => x.min)) : 0, tMax = d ? Math.max(...d.daily.map((x) => x.max)) : 1;

  return (
    <Window bare>
      <div className="h-full w-full text-white overflow-hidden flex flex-col" style={{ background: bg }}>
        <div className="h-[44px] shrink-0 drag" />
        <form onSubmit={search} className="no-drag flex items-center gap-2 mx-auto w-[min(520px,90%)] relative">
          <div className="flex items-center gap-2 flex-1 bg-white/15 rounded-lg px-3 py-[5px]"><Search size={14} className="opacity-70" /><input className="bg-transparent outline-none flex-1 placeholder:text-white/60" placeholder="Search for a city" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <button type="button" className="px-2 py-[5px] bg-white/15 rounded-lg text-[12px]" onClick={() => update({ weatherUnits: s.weatherUnits === 'metric' ? 'imperial' : 'metric' })}>{unit.t}</button>
          {searching && <Spinner size={14} />}
          {res.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[#1c2a4a]/95 rounded-xl p-1 z-10 shadow-xl">
              {res.map((c) => <button key={`${c.lat},${c.lon}`} type="button" className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/10 text-left" onClick={() => { void update({ weatherCity: c }); setRes([]); setQ(''); }}><MapPin size={13} />{c.name}<span className="text-white/50 text-[12px]">{c.country}</span></button>)}
            </div>
          )}
        </form>
        {err && <div className="text-center text-[12px] mt-2 text-white/80">{err}</div>}
        {!wx.city ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-white/80"><MapPin size={40} /><div className="text-[18px]">Search for your city to see the weather</div><div className="text-[12px] text-white/60">Forecasts from Open-Meteo.com</div></div>
        ) : !d ? (
          <div className="flex-1 flex items-center justify-center text-white/80">{wx.error ? `Couldn't load weather: ${wx.error}` : <Spinner />}</div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <div className="text-center mt-4">
              <div className="text-[28px]">{wx.city.name}</div>
              <div className="text-[86px] font-thin leading-none">{Math.round(d.current.temp)}°</div>
              <div className="text-[17px] text-white/90">{wmoLabel(d.current.code)}</div>
              <div className="text-[15px]">H:{Math.round(d.daily[0].max)}°  L:{Math.round(d.daily[0].min)}°</div>
            </div>
            <div className="mt-6 bg-white/10 rounded-2xl p-4 backdrop-blur">
              <div className="text-[11px] uppercase tracking-wide text-white/60 mb-3 flex justify-between"><span>Hourly forecast</span><span className="flex items-center gap-1"><RefreshCw size={10} /> {new Date(d.fetched).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span></div>
              <div className="flex gap-5 overflow-x-auto pb-1">
                {d.hourly.map((h, i) => (
                  <div key={h.time} className="flex flex-col items-center gap-2 min-w-[42px]">
                    <div className="text-[12px]">{i === 0 ? 'Now' : new Date(h.time).toLocaleTimeString([], { hour: 'numeric' })}</div>
                    <WeatherIcon code={h.code} isDay={new Date(h.time).getHours() > 6 && new Date(h.time).getHours() < 19} size={22} />
                    {h.precip > 20 && <div className="text-[10px] text-[#9fd3ff]">{h.precip}%</div>}
                    <div className="text-[14px]">{Math.round(h.temp)}°</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-[1.2fr_1fr] gap-4 mt-4">
              <div className="bg-white/10 rounded-2xl p-4">
                <div className="text-[11px] uppercase tracking-wide text-white/60 mb-2">10-day forecast</div>
                {d.daily.map((x, i) => (
                  <div key={x.date} className="flex items-center gap-3 py-[7px] border-t border-white/10 first:border-0">
                    <div className="w-[48px] text-[14px]">{i === 0 ? 'Today' : new Date(x.date).toLocaleDateString([], { weekday: 'short' })}</div>
                    <div className="w-[40px] flex flex-col items-center"><WeatherIcon code={x.code} size={20} />{x.precip > 20 && <span className="text-[10px] text-[#9fd3ff]">{x.precip}%</span>}</div>
                    <div className="w-[34px] text-right text-white/60">{Math.round(x.min)}°</div>
                    <div className="flex-1 h-[5px] rounded-full bg-white/15 relative"><div className="absolute h-full rounded-full" style={{ left: `${((x.min - tMin) / (tMax - tMin || 1)) * 100}%`, right: `${100 - ((x.max - tMin) / (tMax - tMin || 1)) * 100}%`, background: 'linear-gradient(90deg,#6fd0ff,#ffd84d,#ff9f43)' }} /></div>
                    <div className="w-[34px]">{Math.round(x.max)}°</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 content-start">
                <Tile icon={<Thermometer size={13} />} label="Feels like" value={`${Math.round(d.current.feels)}°`} />
                <Tile icon={<Wind size={13} />} label="Wind" value={`${Math.round(d.current.wind)} ${unit.w}`} />
                <Tile icon={<Droplets size={13} />} label="Humidity" value={`${d.current.humidity}%`} />
                <Tile icon={<Gauge size={13} />} label="Pressure" value={`${Math.round(d.current.pressure)} hPa`} />
                <Tile icon={<Sunrise size={13} />} label="Sunrise" value={new Date(d.daily[0].sunrise).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} />
                <Tile icon={<Sunset size={13} />} label="Sunset" value={new Date(d.daily[0].sunset).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} />
                <Tile icon={<Eye size={13} />} label="Visibility" value={d.current.visibility !== null ? `${(d.current.visibility / 1000).toFixed(0)} km` : '—'} />
                <Tile icon={<Sunrise size={13} />} label="UV index" value={d.current.uv !== null ? String(Math.round(d.current.uv)) : '—'} />
              </div>
            </div>
            <div className="text-center text-[11px] text-white/50 mt-4">Weather data by Open-Meteo.com</div>
          </div>
        )}
      </div>
    </Window>
  );
}

function Tile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="bg-white/10 rounded-2xl p-3 aspect-[1.4]"><div className="text-[11px] uppercase tracking-wide text-white/60 flex items-center gap-1">{icon}{label}</div><div className="text-[24px] font-light mt-2">{value}</div></div>;
}
