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

type FacebookPage = { id: string; name: string };

export type FacebookStatus = {
  configured: boolean;
  connected: boolean;
  page: FacebookPage | null;
  scopes: string[];
  connectedAt: string | null;
};

type FacebookConnectionValue = {
  loading: boolean;
  connecting: boolean;
  refreshing: boolean;
  unreachable: boolean;
  configured: boolean;
  connected: boolean;
  page: FacebookPage | null;
  scopes: string[];
  connect: () => void;
  disconnect: () => Promise<void>;
};

const EMPTY_STATUS: FacebookStatus = {
  configured: false,
  connected: false,
  page: null,
  scopes: [],
  connectedAt: null,
};

const FacebookConnectionContext =
  createContext<FacebookConnectionValue | null>(null);

function notifyUnconfigured() {
  toast.error('Facebook publishing isn\'t set up yet', {
    description:
      'The workspace owner still needs to finish the Facebook app setup.',
  });
}

function notifyOutcome(outcome: string, status: FacebookStatus | null) {
  switch (outcome) {
    case 'connected':
      toast.success('Facebook Page connected', {
        description: status?.page
          ? `${status.page.name} is linked to this desk.`
          : 'Your Page is linked to this desk.',
      });
      break;
    case 'denied':
      toast.info('Connection canceled', {
        description: 'You can connect your Page anytime from the masthead.',
      });
      break;
    case 'unconfigured':
      notifyUnconfigured();
      break;
    case 'no_pages':
      toast.error('No Facebook Page found', {
        description:
          'Only Pages you manage, with the requested permissions granted, can be connected.',
      });
      break;
    case 'page_not_found':
      toast.error('Pinned Page not found', {
        description:
          'The workspace\'s pinned Facebook Page could not be found. Ask the workspace owner to review the Facebook settings.',
      });
      break;
    case 'state':
      toast.error('Connection could not be verified', {
        description:
          'The sign-in attempt expired or was interrupted. Please try again.',
      });
      break;
    default:
      toast.error('Could not connect Facebook Page', {
        description:
          'Please try again. If it keeps failing, ask the workspace owner to check the setup.',
      });
  }
}

export function FacebookConnectionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<FacebookStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreachable, setUnreachable] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const pathname = usePathname();
  const lastPathname = useRef<string | null>(null);
  const flashHandled = useRef(false);

  const refresh = useCallback(
    async (silent = false): Promise<FacebookStatus | null> => {
      if (!silent) setRefreshing(true);

      try {
        const res = await fetch('/api/facebook/status', {
          cache: 'no-store',
        });

        if (res.status === 401) {
          setStatus(EMPTY_STATUS);
          setUnreachable(false);
          return EMPTY_STATUS;
        }

        if (!res.ok) throw new Error('Facebook status request failed');

        const data = (await res.json()) as FacebookStatus;
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
      const outcome = params.get('facebook');
      if (!outcome) return;

      notifyOutcome(outcome, next);

      params.delete('facebook');
      const search = params.toString();
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`
      );
    })();
  }, [pathname, refresh]);

  const connect = useCallback(() => {
    if (loading || connecting) return;

    if (!status?.configured) {
      notifyUnconfigured();
      return;
    }

    // Full-page OAuth redirect; the flag keeps the button honest while it
    // round-trips.
    setConnecting(true);
    window.location.assign(
      `/api/facebook/connect?next=${encodeURIComponent(window.location.pathname)}`
    );
  }, [loading, connecting, status?.configured]);

  const disconnect = useCallback(async () => {
    setRefreshing(true);

    try {
      const res = await fetch('/api/facebook/disconnect', { method: 'POST' });
      if (!res.ok) throw new Error('Disconnect failed');
      await refresh(true);
      toast.success('Facebook Page disconnected');
    } catch {
      toast.error('Could not disconnect the Page', {
        description: 'Please try again.',
      });
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const value = useMemo<FacebookConnectionValue>(
    () => ({
      loading,
      connecting,
      refreshing,
      unreachable,
      configured: status?.configured ?? false,
      connected: status?.connected ?? false,
      page: status?.page ?? null,
      scopes: status?.scopes ?? [],
      connect,
      disconnect,
    }),
    [loading, connecting, refreshing, unreachable, status, connect, disconnect]
  );

  return (
    <FacebookConnectionContext.Provider value={value}>
      {children}
    </FacebookConnectionContext.Provider>
  );
}

export function useFacebookConnection() {
  const context = useContext(FacebookConnectionContext);
  if (!context) {
    throw new Error(
      'useFacebookConnection must be used within FacebookConnectionProvider'
    );
  }
  return context;
}
