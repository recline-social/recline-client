export const Permissions = {
  VIEW_CHANNEL:     1,
  SEND_MESSAGES:    2,
  MANAGE_MESSAGES:  4,
  MANAGE_CHANNELS:  8,
  KICK_MEMBERS:     16,
  BAN_MEMBERS:      32,
  MANAGE_ROLES:     64,
  MANAGE_SERVER:    128,
  MENTION_EVERYONE: 256,
  CONNECT_VOICE:    512,
  SPEAK_VOICE:      1024,
  ADMINISTRATOR:    1073741824, // 1 << 30
} as const;

export type PermissionFlag = typeof Permissions[keyof typeof Permissions];

// Default @everyone permissions: view, send, connect voice, speak voice
export const DEFAULT_EVERYONE_PERMS =
  Permissions.VIEW_CHANNEL |
  Permissions.SEND_MESSAGES |
  Permissions.CONNECT_VOICE |
  Permissions.SPEAK_VOICE; // = 1539

export function hasPermission(perms: number, flag: number): boolean {
  return (perms & Permissions.ADMINISTRATOR) !== 0 || (perms & flag) !== 0;
}

export function computeEffectivePerms(rolePerms: number[]): number {
  return rolePerms.reduce((acc, p) => acc | p, 0);
}
