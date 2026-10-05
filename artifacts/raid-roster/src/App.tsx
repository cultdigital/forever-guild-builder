import { useEffect, useRef } from 'react';
import markup from './legacy/roster.html?raw';

// Preserve the imported DOM and event-driven interactions rather than redesigning them.
export default function App() {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // @ts-ignore original JavaScript controller
    import('./legacy/app.js').catch((error) => {
      console.error(error);
      const status = document.getElementById('headline-stats');
      if (status) status.textContent = 'The roster could not start. Please reload.';
    });
  }, []);
  return <div dangerouslySetInnerHTML={{ __html: markup }} />;
}