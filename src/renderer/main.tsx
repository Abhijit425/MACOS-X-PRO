import React, { StrictMode, Suspense, lazy, Component, ReactNode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import './styles.css';
import { MotionCtx, useSettings, useThemeSync } from './lib/hooks';
import { Providers, Spinner } from './components/ui';

const Shell = lazy(() => import('./shell/Shell'));
const MenuBar = lazy(() => import('./menubar/MenuBar'));
const Desktop = lazy(() => import('./desktop/Desktop'));
const Setup = lazy(() => import('./setup/Setup'));
const Capture = lazy(() => import('./capture/Capture'));
const APPS: Record<string, React.LazyExoticComponent<() => React.ReactElement>> = {
  finder: lazy(() => import('./apps/Finder')),
  notes: lazy(() => import('./apps/Notes')),
  calculator: lazy(() => import('./apps/Calculator')),
  calendar: lazy(() => import('./apps/Calendar')),
  weather: lazy(() => import('./apps/Weather')),
  clock: lazy(() => import('./apps/Clock')),
  music: lazy(() => import('./apps/Music')),
  photos: lazy(() => import('./apps/Photos')),
  screenshot: lazy(() => import('./apps/Screenshot')),
  clipboard: lazy(() => import('./apps/Clipboard')),
  monitor: lazy(() => import('./apps/Monitor')),
  taskmanager: lazy(() => import('./apps/TaskManager')),
  wallpapers: lazy(() => import('./apps/Wallpapers')),
  settings: lazy(() => import('./apps/Settings')),
};

class Boundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error) { console.error(err); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center glass rounded-xl" data-hit>
        <div className="font-semibold">Something went wrong in this view</div>
        <div className="muted text-[12px] max-w-[420px] break-words">{this.state.err.message}</div>
        <button className="btn btn-primary" onClick={() => location.reload()}>Reload</button>
      </div>
    );
  }
}

function Root() {
  useThemeSync();
  const [s] = useSettings();
  const [route, query] = location.hash.replace(/^#\/?/, '').split('?');
  const params = new URLSearchParams(query || '');
  useEffect(() => { document.documentElement.dataset.route = route.split('/')[0]; }, [route]);
  const enabled = s.animations !== 'off';
  const speed = s.animations === 'reduced' ? 1.6 : s.animationSpeed;
  let view: ReactNode = null;
  if (route === 'shell') view = <Shell />;
  else if (route === 'menubar') view = <MenuBar />;
  else if (route === 'desktop') view = <Desktop displayId={params.get('display') || ''} primary={params.get('primary') === '1'} />;
  else if (route === 'setup') view = <Setup />;
  else if (route === 'capture') view = <Capture img={params.get('img') || ''} />;
  else if (route.startsWith('app/')) {
    const App = APPS[route.slice(4)];
    view = App ? <App /> : <div>Unknown app</div>;
  }
  return (
    <MotionCtx.Provider value={{ enabled, speed }}>
      <MotionConfig reducedMotion={enabled ? (s.animations === 'reduced' ? 'user' : 'never') : 'always'}>
        <Providers>
          <Boundary>
            <Suspense fallback={route.startsWith('app/') || route === 'setup' ? <div className="h-full flex items-center justify-center"><Spinner /></div> : null}>{view}</Suspense>
          </Boundary>
        </Providers>
      </MotionConfig>
    </MotionCtx.Provider>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Root /></StrictMode>);
