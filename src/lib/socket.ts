import { io, type Socket } from 'socket.io-client';
import { getToken } from './api';
import { getServerUrl } from './serverUrl';

let socket: Socket | null = null;
let socketUrl: string | null = null;

export function getSocket(): Socket {
  const url = getServerUrl() || '/';
  // if the configured server URL changed (e.g. after first-launch setup),
  // tear down the old socket so we reconnect to the new origin.
  if (socket && socketUrl !== url) {
    socket.disconnect();
    socket = null;
  }
  if (socket) return socket;
  socketUrl = url;
  // Use the callback form so Socket.IO fetches a fresh token on every
  // (re)connect attempt — prevents expired sessions from being replayed
  // after a background reconnect. (#30)
  socket = io(url, {
    autoConnect: false,
    transports: ['websocket'],
    auth: (cb: (data: Record<string, unknown>) => void) => cb({ token: getToken() }),
  });
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  if (socket && socket.connected) socket.disconnect();
}
