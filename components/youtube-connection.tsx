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

export type YouTubeAccountInfo = {
  id: string;
  name: string;
};

export type YouTubeStatus = {
  configured: boolean;
  connected: boolean;
  account: YouTubeAccountInfo | null;
  scopes: string[];
  hasRefresh: boolean;
  tokenExpiresAt: string | null;
  connectedAt: string | null;
};

type YouTubeConnectionValue = {
  loading: boolean;
  refreshing: boolean;
  configured: boolean;
  connected: boolean;
  unreachable: boolean;
  account: YouTubeAccountInfo | null;
  connect: () => void;
  refresh: () => void;
};

const EMPTY_STATUS: YouTubeStatus = {
  configured: false,
  connected: false,
  account: null,
  scopes: [],
  hasRefresh: false,
  tokenExpiresAt: null,
  connectedAt: null,
};

const YouTubeConnectionContext =
  createContext<YouTubeConnectionValue | null>(null);

function notifyOutcome(outcome: string, status: YouTubeStatus | null) {
  if (outcome === 'connected') {
    if (status?.connected) {
      toast.success('YouTube channel connected', {
        description: `Publishing to ${status.account?.name ?? 'your channel'}.`,
      });
    } else {
      toast.warning('Grant stored, channel not resolved', {
        description:
          'YouTube accepted the connection but no channel came back. Reload and reopen the page.',
      });
    }
  } else if (outcome === 'denied') {
    toast.error('YouTube authorization was denied.');
  } else if (outcome !== 'unconfigured') {
    toast.error('YouTube connection failed.', {
      description: `Outcome: ${outcome}`,
    });
  }
}

export function YouTubeConnectionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<YouTubeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreachable, setUnreachable] = useState(false);
  const pathname = usePathname();
  const lastPathname = useRef<string | null>(null);
  const flashHandled = useRef(false);

  const refresh = useCallback(
    async (silent = false): Promise<YouTubeStatus | null> => {
      if (!silent) setRefreshing(true);

      try {
        const res = await fetch('/api/youtube/status', {
          cache: 'no-store',
        });

        if (res.status === 401) {
          setStatus(EMPTY_STATUS);
          setUnreachable(false);
          return EMPTY_STATUS;
        }

        if (!res.ok) throw new Error('YouTube status request failed');

        const data = (await res.json()) as YouTubeStatus;
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
      const outcome = params.get('google');
      if (!outcome) return;

      notifyOutcome(outcome, next);

      params.delete('google');
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
      toast.warning('YouTube is not configured', {
        description:
          'Add the Google OAuth client credentials to this environment first.',
      });
      return;
    }

    window.location.assign('/api/youtube/connect');
  }, [loading, status?.configured]);

  const value = useMemo<YouTubeConnectionValue>(
    () => ({
      loading,
      refreshing,
      configured: status?.configured ?? false,
      connected: Boolean(status?.connected),
      unreachable,
      account: status?.account ?? null,
      connect,
      refresh,
    }),
    [loading, refreshing, status, unreachable, connect, refresh]
  );

  return (
    <YouTubeConnectionContext.Provider value={value}>
      {children}
    </YouTubeConnectionContext.Provider>
  );
}

export function useYouTubeConnection() {
  const value = useContext(YouTubeConnectionContext);
  if (!value) {
    throw new Error(
      'useYouTubeConnection must be used inside YouTubeConnectionProvider.'
    );
  }
  return value;
}
