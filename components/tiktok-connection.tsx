'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';

export type TikTokAccountInfo = {
  id: string;
  name: string;
  thumbnail: string | null;
};

export type TikTokStatus = {
  configured: boolean;
  publicPostingApproved: boolean;
  connected: boolean;
  account: TikTokAccountInfo | null;
  scopes: string[];
  hasRefresh: boolean;
  tokenExpiresAt: string | null;
  connectedAt: string | null;
};

type TikTokConnectionValue = {
  loading: boolean;
  refreshing: boolean;
  configured: boolean;
  connected: boolean;
  unreachable: boolean;
  account: TikTokAccountInfo | null;
  publicPostingApproved: boolean;
  connect: () => void;
  refresh: () => Promise<TikTokStatus | null>;
};

const EMPTY_STATUS: TikTokStatus = {
  configured: false,
  publicPostingApproved: false,
  connected: false,
  account: null,
  scopes: [],
  hasRefresh: false,
  tokenExpiresAt: null,
  connectedAt: null,
};

const TikTokConnectionContext = createContext<TikTokConnectionValue | null>(null);

function notifyOutcome(outcome: string, status: TikTokStatus | null) {
  if (outcome === 'connected') {
    if (status?.connected) {
      toast.success('TikTok account connected', {
        description: `Direct posts go to @${status.account?.name ?? 'your account'}.`,
      });
    } else {
      toast.warning('Grant stored, account not resolved', {
        description:
          'TikTok accepted the connection but the profile probe failed. Reload and reopen the page.',
      });
    }
  } else if (outcome === 'denied') {
    toast.error('TikTok authorization was denied.');
  } else if (outcome !== 'unconfigured') {
    toast.error('TikTok connection failed.', {
      description: `Outcome: ${outcome}`,
    });
  }
}

/** Mirrors the other platform connection hooks, fed by /api/tiktok/status. */
export function TikTokConnectionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<TikTokStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreachable, setUnreachable] = useState(false);
  const pathname = usePathname();
  const lastPathname = useRef<string | null>(null);
  const flashHandled = useRef(false);

  const refresh = useCallback(
    async (silent = false): Promise<TikTokStatus | null> => {
      if (!silent) setRefreshing(true);

      try {
        const res = await fetch('/api/tiktok/status', {
          cache: 'no-store',
        });

        if (res.status === 401) {
          setStatus(EMPTY_STATUS);
          setUnreachable(false);
          return EMPTY_STATUS;
        }

        if (!res.ok) throw new Error('TikTok status request failed');

        const data = (await res.json()) as TikTokStatus;
        setStatus(data);
        setUnreachable(false);
        return data;
      } catch {
        setUnreachable(true);
        return null;
      } finally {
        setLoading(false);
        if (!silent) setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    if (lastPathname.current === pathname) return;
    const firstLoad = lastPathname.current === null;
    lastPathname.current = pathname;

    (async () => {
      const next = await refresh(!firstLoad);

      if (flashHandled.current) return;
      flashHandled.current = true;

      const params = new URLSearchParams(window.location.search);
      const outcome = params.get('platform');
      if (!outcome) return;

      notifyOutcome(outcome, next);

      params.delete('platform');
      const search = params.toString();
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`
      );
    })();
  }, [pathname, refresh]);

  const connect = useCallback(() => {
    if (loading) return;

    if (!status?.configured) {
      toast.warning('TikTok is not configured', {
        description:
          'Add the TikTok client key and secret to this environment first.',
      });
      return;
    }

    window.location.assign(
      `/api/tiktok/connect?next=${encodeURIComponent(window.location.pathname)}`
    );
  }, [loading, status?.configured]);

  const value = useMemo<TikTokConnectionValue>(
    () => ({
      loading,
      refreshing,
      configured: status?.configured ?? false,
      connected: Boolean(status?.connected),
      unreachable,
      account: status?.account ?? null,
      publicPostingApproved: status?.publicPostingApproved ?? false,
      connect,
      refresh,
    }),
    [loading, refreshing, status, unreachable, connect, refresh]
  );

  return (
    <TikTokConnectionContext.Provider value={value}>
      {children}
    </TikTokConnectionContext.Provider>
  );
}

export function useTikTokConnection() {
  const value = useContext(TikTokConnectionContext);
  if (!value) {
    throw new Error(
      'useTikTokConnection must be used inside TikTokConnectionProvider.'
    );
  }
  return value;
}
