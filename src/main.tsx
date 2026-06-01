import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/index.css';

// ── Datadog RUM ───────────────────────────────────────────────────────────────
// Requires VITE_DD_RUM_APP_ID and VITE_DD_RUM_CLIENT_TOKEN at build time.
// Get these from Datadog → UX Monitoring → RUM Applications → New Application.
// Leave blank in dev — RUM simply won't initialise.
const RUM_APP_ID     = import.meta.env.VITE_DD_RUM_APP_ID as string | undefined;
const RUM_CLIENT_TOKEN = import.meta.env.VITE_DD_RUM_CLIENT_TOKEN as string | undefined;

if (RUM_APP_ID && RUM_CLIENT_TOKEN) {
  import('@datadog/browser-rum').then(({ datadogRum }) => {
    datadogRum.init({
      applicationId:        RUM_APP_ID,
      clientToken:          RUM_CLIENT_TOKEN,
      site:                 (import.meta.env.VITE_DD_SITE as string | undefined) ?? 'us5.datadoghq.com',
      service:              'recline-client',
      env:                  import.meta.env.MODE,
      version:              '0.1.0',
      sessionSampleRate:    100,
      // Session replay OFF — Recline is a private comms app; we never want
      // a recording of what users type or read. Zero means no sessions are
      // ever captured, even if startSessionReplayRecording() is called.
      sessionReplaySampleRate: 0,
      // Interaction tracking OFF — click/tap maps would leak which buttons
      // users press (e.g. "delete message", "unlock server"). Not worth it.
      trackUserInteractions:  false,
      trackResources:         true,  // network timing — no user data
      trackLongTasks:         true,  // performance — no user data
      // 'mask' redacts ALL text content in the DOM, not just inputs.
      // Belt-and-suspenders even with replay disabled.
      defaultPrivacyLevel:  'mask',
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
