/** Minimal ambient types for netlify-identity-widget (no bundled @types). */
declare module 'netlify-identity-widget' {
  export interface User {
    id: string;
    email: string;
    user_metadata?: { full_name?: string; avatar_url?: string };
    app_metadata?: { provider?: string; roles?: string[] };
    token?: {
      access_token: string;
      refresh_token: string;
      expires_at: number;
    };
  }

  export type InitOpts = { APIUrl?: string; locale?: string };

  export function init(opts?: InitOpts): void;
  export function on(event: 'init', cb: (user: User | null) => void): void;
  export function on(event: 'login', cb: (user: User) => void): void;
  export function on(event: 'logout', cb: () => void): void;
  export function on(event: 'error', cb: (err: Error) => void): void;
  export function off(event: string, cb?: (...args: unknown[]) => void): void;
  export function open(tab?: 'login' | 'signup'): void;
  export function close(): void;
  export function logout(): void;
  export function currentUser(): User | null;
  /** Returns a fresh access token, refreshing if needed. */
  export function refresh(force?: boolean): Promise<string>;

  const netlifyIdentity: {
    init: typeof init;
    on: typeof on;
    off: typeof off;
    open: typeof open;
    close: typeof close;
    logout: typeof logout;
    currentUser: typeof currentUser;
    refresh: typeof refresh;
  };
  export default netlifyIdentity;
}
