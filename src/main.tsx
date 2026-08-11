import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/index.css';

// Privacy-sensitive telemetry is opt-in for Open Beta. Supplying Datadog keys alone
// is not enough: a build must also set VITE_TELEMETRY_ENABLED=1. Session replay,
// interaction tracking, and resource URL collection remain disabled.
const TELEMETRY_ENABLED = import.meta.env.VITE_TELEMETRY_ENABLED === '1';
const RUM_APP_ID = import.meta.env.VITE_DD_RUM_APP_ID as string | undefined;
const RUM_CLIENT_TOKEN = import.meta.env.VITE_DD_RUM_CLIENT_TOKEN as string | undefined;
const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '0.2.0-beta.1';
const requestedSampleRate = Number(import.meta.env.VITE_DD_SESSION_SAMPLE_RATE ?? '10');
const SESSION_SAMPLE_RATE = Number.isFinite(requestedSampleRate)
  ? Math.min(100, Math.max(0, requestedSampleRate))
  : 10;

if (TELEMETRY_ENABLED && RUM_APP_ID && RUM_CLIENT_TOKEN) {
  import('@datadog/browser-rum').then(({ datadogRum }) => {
    datadogRum.init({
      applicationId: RUM_APP_ID,
      clientToken: RUM_CLIENT_TOKEN,
      site: (import.meta.env.VITE_DD_SITE as string | undefined) ?? 'us5.datadoghq.com',
      service: 'recline-client',
      env: import.meta.env.MODE,
      version: APP_VERSION,
      sessionSampleRate: SESSION_SAMPLE_RATE,
      sessionReplaySampleRate: 0,
      trackUserInteractions: false,
      // Resource events include URLs and timing metadata that can reveal which
      // conversations or endpoints a user visited. Keep them disabled by default.
      trackResources: false,
      trackLongTasks: true,
      defaultPrivacyLevel: 'mask',
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
