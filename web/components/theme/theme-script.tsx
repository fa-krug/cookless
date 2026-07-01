// Server component: emits a blocking inline script that applies the persisted
// theme class before first paint, preventing a flash of the wrong theme.
export function ThemeScript() {
  const js = `(function(){try{var t=localStorage.getItem('theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
