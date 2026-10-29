import { useEffect, useRef } from "react";

const emblem = new URL('./marfeyx.svg', import.meta.url).href;

/** The shared Marfeyx identity. Keep this in sync with the workspace branding source. */
export function MarfeyxBrand({ product, home = false }: { product: string; home?: boolean }) {
  const identity = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const header = identity.current?.closest("header");
    if (!header || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const height = Math.ceil(header.getBoundingClientRect().height);
      if (height > 0) document.documentElement.style.setProperty("--mfx-header-height", `${height}px`);
    };
    const observer = new ResizeObserver(update);
    observer.observe(header);
    update();
    return () => observer.disconnect();
  }, []);
  return (
    <div className="mfx-identity" ref={identity}>
      <a className="mfx-brand" href={home ? './' : 'https://tools.marfeyx.ch/'} aria-label={home ? 'Marfeyx Tools home' : 'Marfeyx — all tools'}>
        <img className="mfx-emblem" src={emblem} alt="" width="36" height="36" />
        <span className="mfx-wordmark"><strong>Marfeyx</strong><span>{product}</span></span>
      </a>
      {!home && <a className="mfx-hub-link" href="https://tools.marfeyx.ch/" aria-label="Explore all Marfeyx tools" title="All Marfeyx tools">All tools <span aria-hidden="true">↗</span></a>}
    </div>
  );
}
