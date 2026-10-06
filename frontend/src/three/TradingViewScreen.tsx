import { useEffect, useRef } from 'react';
import { Html } from '@react-three/drei';
import { tvSymbol } from '../lib/format';

/** Mounts the official TradingView Advanced Chart widget into a DOM node. */
export function TradingViewWidget({ symbol, theme = 'dark', interval = '1' }: { symbol: string; theme?: string; interval?: string }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    el.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'tradingview-widget-container';
    container.style.height = '100%';
    container.style.width = '100%';
    const inner = document.createElement('div');
    inner.className = 'tradingview-widget-container__widget';
    inner.style.height = '100%';
    inner.style.width = '100%';
    container.appendChild(inner);
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: tvSymbol(symbol),
      interval,
      timezone: 'Etc/UTC',
      theme,
      style: '1',
      locale: 'en',
      hide_top_toolbar: true,
      hide_legend: false,
      allow_symbol_change: false,
      save_image: false,
      backgroundColor: 'rgba(5,8,13,1)',
      gridColor: 'rgba(120,160,200,0.06)',
      support_host: 'https://www.tradingview.com',
    });
    container.appendChild(script);
    el.appendChild(container);
    return () => {
      el.innerHTML = '';
    };
  }, [symbol, theme, interval]);

  return <div ref={host} className="h-full w-full" />;
}

/** The same widget, projected onto a surface inside the 3D office. */
export function TradingViewScreen({
  position,
  rotation = [0, 0, 0],
  symbol,
  width = 1180,
  height = 640,
  scale = 0.0049,
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
  symbol: string;
  width?: number;
  height?: number;
  scale?: number;
}) {
  return (
    <Html transform position={position} rotation={rotation} scale={scale} zIndexRange={[5, 0]} occlude={false}>
      <div
        style={{
          width,
          height,
          background: '#05080d',
          border: '1px solid rgba(120,170,230,0.18)',
          boxShadow: '0 0 60px rgba(60,130,220,0.25)',
          overflow: 'hidden',
        }}
      >
        <TradingViewWidget symbol={symbol} />
      </div>
    </Html>
  );
}
