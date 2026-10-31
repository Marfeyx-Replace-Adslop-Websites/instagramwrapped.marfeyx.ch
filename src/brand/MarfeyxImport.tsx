import type { ChangeEvent, RefObject } from 'react';
import { MarfeyxBrand } from './MarfeyxBrand';

/** A task-first entry point. The owning application keeps its parser and state. */
export function MarfeyxImport({ product, title, description, instruction, inputRef, onChange, onBrowse, busy, status = '', errors = [] }: {
  product: string; title: string; description: string; instruction: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onBrowse: () => void; busy: boolean; status?: string; errors?: string[];
}) {
  return <div className="mfx-import-shell">
    <header className="mfx-app-header"><MarfeyxBrand product={product} /><span>Private by design</span></header>
    <main className="mfx-import-main">
      <section className="mfx-import-copy">
        <span className="mfx-label">Your personal archive</span>
        <h1>{title}</h1><p>{description}</p>
        <div className="mfx-import-detail"><strong>Made for your data.</strong><p>{instruction}</p></div>
        <a href="privacy.html">How your privacy is protected <span aria-hidden="true">↗</span></a>
      </section>
      <section className="mfx-import-card" aria-label="Import your archive">
        <span className="mfx-import-glyph" aria-hidden="true"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M10 4h2m-2 4h2m-2 4h2m-2 4h2"/></svg></span>
        <h2>{busy ? 'Reading your archive…' : 'Start with your export.'}</h2>
        <p>Your original ZIP. A private workspace.<br />Everything stays on this device.</p>
        <input ref={inputRef} className="hidden-file-input" type="file" accept=".zip,application/zip" disabled={busy} onChange={onChange} aria-label={`Import ${product} ZIP archive`} />
        <button className="mfx-import-button" type="button" onClick={onBrowse} disabled={busy}>{busy ? 'Processing locally…' : 'Choose ZIP archive'}<span aria-hidden="true">↗</span></button>
        <small>ZIP archive · no account required</small>
        {status && <p className="mfx-import-status" role="status">{status}</p>}
        {errors.length > 0 && <div className="mfx-import-error" role="alert">{errors.map((error, index) => <p key={index}>{error}</p>)}</div>}
      </section>
      <div className="mfx-import-notes"><span>Read it your way.</span><p>Browse privately. Keep your originals. Close the tab to clear this session.</p></div>
    </main>
  </div>;
}
