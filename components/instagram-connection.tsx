'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';

export type InstagramAccountInfo = {
  id: string;
  username: string;
  picture: string | null;
};

export type InstagramStatus = {
  configured: boolean;
  connected: boolean;
  ig: InstagramAccountInfo | null;
  scopes: string[];
  missingScopes: string[];
  reason: string | null;
  detail: string | null;
  pageId: string | null;
};

type InstagramConnectionValue = {
  loading: boolean;
  configured: boolean;
  connected: boolean;
  unreachable: boolean;
  ig: InstagramAccountInfo | null;
  reason: string | null;
  detail: string | null;
  connect: () => void;
  refresh: () => void;
};

const EMPTY_STATUS: InstagramStatus = {
  configured: false,
  connected: false,
  ig: null,
  scopes: [],
  missingScopes: [],
  reason: null,
  detail: null,
  pageId: null,
};

const InstagramConnectionContext =
  createContext<InstagramConnectionValue | null>(null);

function notifyOutcome(pathname: string, status: InstagramStatus | null) {
  const search = new URLSearchParams(pathname.split('?')[1] ?? '');
  const outcome = search.get('facebook');
  if (outcome === 'connected') {
    if (status?.connected) {
      toast.success('Instagram account ready', {
        description: `Publishing as @${status.ig?.username ?? 'instagram'}.`,
      });
    } else {
      toast.warning('Connection granted, Instagram not found', {
        description:
          'The Facebook Page has no professional Instagram account linked. Link one first, then retry.',
      });
    }
  } else if (outcome === 'denied') {
    toast.error('Instagram authorization was denied.');
  } else if (outcome && outcome !== 'reconnect') {
    toast.error('Instagram connection failed.', {
      description: `Outcome: ${outcome}`,
    });
  }
}

/** Mirrors useFacebookConnection, fed by /api/instagram/status. */
export function InstagramConnectionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [status, setStatus] = useState<InstagramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [reachAttempt, setReachAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    fetch('/api/instagram/status', {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as
          | InstagramStatus
          | null;
        if (!active) return;
        if (data && response.ok) {
          setStatus(data);
        } else {
          setStatus(null);
        }
      })
      .catch(() => {
        if (active) setStatus(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    notifyOutcome(pathname, status);
    return () => {
      active = false;
      controller.abort();
    };
    // Re-probe when arriving with an OAuth outcome in the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reachAttempt, pathname.split('?')[0]]);

  const connect = useCallback(() => {
    window.location.href = '/api/instagram/connect';
  }, []);

  const refresh = useCallback(() => {
    setLoading(true);
    setReachAttempt((value) => value + 1);
  }, []);

  const value = useMemo<InstagramConnectionValue>(
    () => ({
      loading,
      configured: status?.configured ?? false,
      connected: Boolean(status?.connected),
      // A settled fetch that produced nothing means the status endpoint was
      // unreachable — the gate copy switches to "reload and retry".
      unreachable: status === null && !loading,
      ig: status?.ig ?? null,
      reason: status?.reason ?? null,
      detail: status?.detail ?? null,
      connect,
      refresh,
    }),
    [loading, status, connect, refresh]
  );

  return (
    <InstagramConnectionContext.Provider value={value}>
      {children}
    </InstagramConnectionContext.Provider>
  );
}

export function useInstagramConnection() {
  const value = useContext(InstagramConnectionContext);
  if (!value) {
    throw new Error(
      'useInstagramConnection must be used inside InstagramConnectionProvider.'
    );
  }
  return value;
}
