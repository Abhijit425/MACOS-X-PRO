import { Sun, Moon, CloudSun, CloudMoon, Cloud, CloudFog, CloudDrizzle, CloudRain, CloudSnow, CloudLightning } from 'lucide-react';
import { wmoKind } from '../lib/weather';

export function WeatherIcon({ code, isDay = true, size = 20, color = true }: { code: number; isDay?: boolean; size?: number; color?: boolean }) {
  const k = wmoKind(code);
  const props = { size, strokeWidth: 1.8 };
  const c = (x: string) => (color ? { color: x } : {});
  switch (k) {
    case 'sun': return isDay ? <Sun {...props} style={c('#ffcc33')} /> : <Moon {...props} style={c('#d8dcff')} />;
    case 'cloud-sun': return isDay ? <CloudSun {...props} style={c('#ffd76a')} /> : <CloudMoon {...props} style={c('#d8dcff')} />;
    case 'fog': return <CloudFog {...props} style={c('#c9d1dc')} />;
    case 'drizzle': return <CloudDrizzle {...props} style={c('#8ec9ff')} />;
    case 'rain': return <CloudRain {...props} style={c('#6fb6ff')} />;
    case 'snow': return <CloudSnow {...props} style={c('#e9f4ff')} />;
    case 'storm': return <CloudLightning {...props} style={c('#ffd84d')} />;
    default: return <Cloud {...props} style={c('#dfe6ee')} />;
  }
}
