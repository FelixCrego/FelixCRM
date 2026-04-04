"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Script from "next/script";

type ConnectContact = {
  isInbound?: () => boolean;
  isConnected?: () => boolean;
  onConnecting?: (callback: () => void) => void;
  onConnected?: (callback: () => void) => void;
  onACW?: (callback: () => void) => void;
  onEnded?: (callback: () => void) => void;
  onDestroy?: (callback: () => void) => void;
  onRefresh?: (callback: () => void) => void;
  getContactId?: () => string;
  getStatus?: () => ConnectAgentState | null;
  sendDigit?: (digit: string) => void;
  getConnections?: () => ConnectConnection[];
  getActiveConnections?: () => ConnectConnection[];
  getInitialConnection?: () => ConnectConnection | null;
  getActiveInitialConnection?: () => ConnectConnection | null;
  getSingleActiveThirdPartyConnection?: () => ConnectConnection | null;
  getAgentConnection?: () => ConnectConnection | null;
  clear?: (callbacks?: ConnectActionCallbacks) => void;
};

type ConnectActionCallbacks = {
  success?: () => void;
  failure?: (error: unknown) => void;
};

type ConnectConnection = {
  destroy?: (callbacks?: ConnectActionCallbacks) => void;
  sendDigits?: (digits: string, callbacks?: ConnectActionCallbacks) => void;
  getEndpoint?: () => { phoneNumber?: string };
  getType?: () => string;
  isActive?: () => boolean;
  isConnected?: () => boolean;
  isConnecting?: () => boolean;
};

type ConnectAgentState = {
  name?: string;
  type?: string;
};

type ConnectAgent = {
  connect?: (
    endpoint: { phoneNumber: string },
    callbacks?: { success?: (contact: ConnectContact) => void; failure?: (error: unknown) => void },
  ) => void;
  getState?: () => ConnectAgentState | null;
  getStatus?: () => ConnectAgentState | null;
  getContacts?: () => ConnectContact[];
  onStateChange?: (callback: (state: ConnectAgentState) => void) => void;
};

type AmazonConnectWindow = Window & {
  connect?: {
    Endpoint?: { byPhoneNumber?: (phoneNumber: string) => { phoneNumber: string } };
    core?: { initCCP?: (container: HTMLElement, options: Record<string, unknown>) => void };
    agent?: (callback: (agent: ConnectAgent) => void) => void;
    contact?: (callback: (contact: ConnectContact) => void) => void;
  };
};

type IncomingCall = {
  active: boolean;
  number: string;
  contactObj: ConnectContact | null;
};

type AmazonConnectContextValue = {
  callActive: boolean;
  callSeconds: number;
  activeContactId: string | null;
  ccpReady: boolean;
  connectionStatus: "loading" | "blocked" | "initializing" | "ready" | "error";
  callStatus: "idle" | "connecting" | "connected" | "acw";
  callError: string | null;
  agentStateLabel: string | null;
  agentReadyForOutbound: boolean;
  retrySecondsRemaining: number;
  retryStatusMessage: string | null;
  startOutboundCall: (dialNumber: string) => Promise<void>;
  endActiveCall: () => void;
  sendCallDigit: (digit: string) => void;
  completeAfterCallWork: () => Promise<boolean>;
};

const AmazonConnectContext = createContext<AmazonConnectContextValue | null>(null);

const CCP_URL = "https://felix-outbound.my.connect.aws/ccp-v2";
const STREAMS_SCRIPT = "https://cdn.jsdelivr.net/npm/amazon-connect-streams/release/connect-streams-min.js";
const CCP_TAB_ID_STORAGE_KEY = "felixcrm_ccp_tab_id";
const CCP_TAB_LOCK_KEY = "felixcrm_ccp_tab_lock";
const CCP_TAB_LOCK_HEARTBEAT_MS = 15_000;
const CCP_TAB_LOCK_TTL_MS = 45_000;

type CcpTabLockRecord = {
  tabId: string;
  expiresAt: number;
};

type DialGuardReason = "PACE" | "THROTTLED";

type DialGuardPayload = {
  ok?: boolean;
  allowed?: boolean;
  blockedUntil?: string | null;
  reason?: DialGuardReason | null;
  waitMs?: number;
};

function normalizePhone(value: string) {
  return value.replace(/\D/g, "").slice(-10);
}

function getContactId(contact: ConnectContact | null | undefined) {
  return typeof contact?.getContactId === "function" ? contact.getContactId() ?? null : null;
}

function getAgentStateLabel(agentState: ConnectAgentState | null | undefined) {
  if (typeof agentState?.name === "string" && agentState.name.trim()) {
    return agentState.name.trim();
  }

  if (typeof agentState?.type === "string" && agentState.type.trim()) {
    return agentState.type.trim();
  }

  return null;
}

function getContactStateLabel(contact: ConnectContact | null | undefined) {
  return getAgentStateLabel(contact?.getStatus?.() ?? null);
}

function isAfterCallWorkStateLabel(stateLabel: string | null | undefined) {
  const normalizedLabel = stateLabel?.trim().toLowerCase() ?? "";
  return normalizedLabel.includes("after call work") || normalizedLabel === "acw" || normalizedLabel.includes("ended");
}

function isClearedContact(contact: ConnectContact | null | undefined) {
  const normalizedLabel = getContactStateLabel(contact)?.toLowerCase() ?? "";
  if (!normalizedLabel) return false;

  return (
    normalizedLabel.includes("destroy") ||
    normalizedLabel.includes("missed") ||
    normalizedLabel.includes("error") ||
    normalizedLabel.includes("rejected")
  );
}

function isConnectingContact(contact: ConnectContact | null | undefined) {
  const normalizedLabel = getContactStateLabel(contact)?.toLowerCase() ?? "";
  if (!normalizedLabel) return false;

  return (
    normalizedLabel.includes("incoming") ||
    normalizedLabel.includes("pending") ||
    normalizedLabel.includes("initiated") ||
    normalizedLabel.includes("connecting")
  );
}

function isConnectedContact(contact: ConnectContact | null | undefined) {
  if (contact?.isConnected?.()) {
    return true;
  }

  if (
    contact?.getActiveConnections?.()?.some((connection) => {
      const connectionType = connection.getType?.()?.trim().toLowerCase() ?? "";
      return connectionType !== "agent" && connection.isConnected?.();
    })
  ) {
    return true;
  }

  const normalizedLabel = getContactStateLabel(contact)?.toLowerCase() ?? "";
  return normalizedLabel.includes("connected");
}

function getNonAgentConnection(contact: ConnectContact | null | undefined) {
  const activeConnections =
    contact?.getConnections?.().filter((connection) => {
      const connectionType = connection.getType?.()?.trim().toLowerCase() ?? "";
      return connectionType !== "agent" && connection.isConnected?.();
    }) ?? [];

  if (activeConnections.length === 1) {
    return activeConnections[0];
  }

  const singleActiveThirdPartyConnection = contact?.getSingleActiveThirdPartyConnection?.() ?? null;
  if (singleActiveThirdPartyConnection?.isConnected?.()) {
    return singleActiveThirdPartyConnection;
  }

  const activeInitialConnection = contact?.getActiveInitialConnection?.() ?? null;
  if (activeInitialConnection?.isConnected?.()) {
    return activeInitialConnection;
  }

  return null;
}

function getDestroyableConnections(contact: ConnectContact | null | undefined) {
  if (!contact) return [];

  const candidates = [
    contact.getAgentConnection?.() ?? null,
    contact.getActiveInitialConnection?.() ?? null,
    contact.getSingleActiveThirdPartyConnection?.() ?? null,
    ...(contact.getActiveConnections?.() ?? []),
    ...(contact.getConnections?.() ?? []),
    contact.getInitialConnection?.() ?? null,
  ];

  const uniqueCandidates: ConnectConnection[] = [];
  for (const candidate of candidates) {
    if (!candidate?.destroy) continue;
    if (uniqueCandidates.includes(candidate)) continue;
    uniqueCandidates.push(candidate);
  }

  return uniqueCandidates;
}

function getConnectOperationErrorMessage(error: unknown, fallbackMessage: string) {
  const details = getConnectErrorDetails(error);
  return details.message || fallbackMessage;
}

function isAgentReadyState(agentState: ConnectAgentState | null | undefined) {
  const normalizedType = typeof agentState?.type === "string" ? agentState.type.trim().toLowerCase() : "";
  if (normalizedType) {
    if (normalizedType === "routable") return true;
    if (["not_routable", "offline", "error"].includes(normalizedType)) return false;
  }

  const normalizedLabel = getAgentStateLabel(agentState)?.toLowerCase() ?? "";
  if (!normalizedLabel) return true;

  if (
    normalizedLabel.includes("after call work") ||
    normalizedLabel === "acw" ||
    normalizedLabel.includes("offline") ||
    normalizedLabel.includes("not routable") ||
    normalizedLabel.includes("error")
  ) {
    return false;
  }

  return true;
}

function createTabId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `felixcrm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readSoftphoneTabLock() {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(CCP_TAB_LOCK_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<CcpTabLockRecord>;
    if (typeof parsed.tabId !== "string" || typeof parsed.expiresAt !== "number") {
      return null;
    }

    return {
      tabId: parsed.tabId,
      expiresAt: parsed.expiresAt,
    } satisfies CcpTabLockRecord;
  } catch {
    return null;
  }
}

function writeSoftphoneTabLock(lock: CcpTabLockRecord) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CCP_TAB_LOCK_KEY, JSON.stringify(lock));
}

function getConnectErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      type: error.name || null,
      message: error.message?.trim() || null,
    };
  }

  if (typeof error === "string") {
    const trimmed = error.trim();
    if (!trimmed) {
      return { type: null, message: null };
    }

    if (trimmed.startsWith("{")) {
      try {
        return getConnectErrorDetails(JSON.parse(trimmed) as unknown);
      } catch {
        // Fall through to the raw string message.
      }
    }

    return {
      type: null,
      message: trimmed,
    };
  }

  if (error && typeof error === "object") {
    const candidate = error as Record<string, unknown>;
    const type =
      typeof candidate.type === "string"
        ? candidate.type
        : typeof candidate.name === "string"
          ? candidate.name
          : typeof candidate.code === "string"
            ? candidate.code
            : null;
    const message = typeof candidate.message === "string" ? candidate.message.trim() : null;

    return { type, message };
  }

  return { type: null, message: null };
}

function getConnectErrorMessage(error: unknown) {
  const details = getConnectErrorDetails(error);
  const normalizedType = details.type?.toLowerCase() ?? "";
  const normalizedMessage = details.message?.toLowerCase() ?? "";

  if (normalizedType.includes("quotaexceeded") || normalizedMessage.includes("maximum capacity")) {
    return "Amazon Connect already has this rep at voice capacity. Close any other FelixCRM tabs, then finish or end the existing CCP contact before starting another call.";
  }

  return details.message || "Amazon Connect could not start the outbound call. Confirm the rep is in a routable status and the CCP is still signed in.";
}

function isThrottledConnectError(error: unknown) {
  const details = getConnectErrorDetails(error);
  const normalizedType = details.type?.toLowerCase() ?? "";
  const normalizedMessage = details.message?.toLowerCase() ?? "";

  return (
    normalizedType.includes("throttl") ||
    normalizedMessage.includes("call throttled") ||
    normalizedMessage.includes("throttled")
  );
}

function getRetryStatusMessage(secondsRemaining: number, reason: DialGuardReason | null) {
  const waitSeconds = Math.max(secondsRemaining, 1);
  if (reason === "PACE") {
    return `Another rep just grabbed the outbound lane. Wait ${waitSeconds}s before the next dial so the team does not stack calls into the same throttle window.`;
  }

  return `Amazon Connect throttled outbound voice. Wait ${waitSeconds}s before the next team attempt.`;
}

export function AmazonConnectProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const ccpContainerRef = useRef<HTMLDivElement | null>(null);
  const isInitialized = useRef(false);
  const activeContactRef = useRef<ConnectContact | null>(null);
  const activeContactIdRef = useRef<string | null>(null);
  const observedContactsRef = useRef(new WeakSet<object>());
  const subscribedAgentRef = useRef<ConnectAgent | null>(null);
  const tabIdRef = useRef<string | null>(null);
  const [agent, setAgent] = useState<ConnectAgent | null>(null);
  const [callActive, setCallActive] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [activeContactId, setActiveContactId] = useState<string | null>(null);
  const [ccpReady, setCcpReady] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"loading" | "blocked" | "initializing" | "ready" | "error">("loading");
  const [callStatus, setCallStatus] = useState<"idle" | "connecting" | "connected" | "acw">("idle");
  const [callError, setCallError] = useState<string | null>(null);
  const [agentStateLabel, setAgentStateLabel] = useState<string | null>(null);
  const [agentReadyForOutbound, setAgentReadyForOutbound] = useState(true);
  const [localRetryBlockedUntil, setLocalRetryBlockedUntil] = useState<number | null>(null);
  const [localRetryReason, setLocalRetryReason] = useState<DialGuardReason | null>(null);
  const [teamRetryBlockedUntil, setTeamRetryBlockedUntil] = useState<number | null>(null);
  const [teamRetryReason, setTeamRetryReason] = useState<DialGuardReason | null>(null);
  const [retrySecondsRemaining, setRetrySecondsRemaining] = useState(0);
  const [incomingCall, setIncomingCall] = useState<IncomingCall>({ active: false, number: "", contactObj: null });
  const [scriptReady, setScriptReady] = useState(false);
  const [tabHasSoftphoneControl, setTabHasSoftphoneControl] = useState(false);

  const effectiveRetryState = useMemo(() => {
    const localUntil = localRetryBlockedUntil ?? 0;
    const teamUntil = teamRetryBlockedUntil ?? 0;
    if (localUntil <= 0 && teamUntil <= 0) {
      return { blockedUntil: null as number | null, reason: null as DialGuardReason | null };
    }

    return localUntil >= teamUntil
      ? { blockedUntil: localRetryBlockedUntil, reason: localRetryReason }
      : { blockedUntil: teamRetryBlockedUntil, reason: teamRetryReason };
  }, [localRetryBlockedUntil, localRetryReason, teamRetryBlockedUntil, teamRetryReason]);

  const retryStatusMessage =
    retrySecondsRemaining > 0 ? getRetryStatusMessage(retrySecondsRemaining, effectiveRetryState.reason) : null;

  useEffect(() => {
    if (!callActive) return;

    const timerId = window.setInterval(() => {
      setCallSeconds((previous) => previous + 1);
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [callActive]);

  useEffect(() => {
    if (!effectiveRetryState.blockedUntil) {
      setRetrySecondsRemaining(0);
      return;
    }

    const syncRemaining = () => {
      const blockedUntil = effectiveRetryState.blockedUntil;
      if (!blockedUntil) {
        setRetrySecondsRemaining(0);
        return;
      }

      const remainingMs = blockedUntil - Date.now();
      if (remainingMs <= 0) {
        if (localRetryBlockedUntil && localRetryBlockedUntil <= Date.now()) {
          setLocalRetryBlockedUntil(null);
          setLocalRetryReason(null);
        }
        if (teamRetryBlockedUntil && teamRetryBlockedUntil <= Date.now()) {
          setTeamRetryBlockedUntil(null);
          setTeamRetryReason(null);
        }
        setRetrySecondsRemaining(0);
        return;
      }

      setRetrySecondsRemaining(Math.ceil(remainingMs / 1000));
    };

    syncRemaining();
    const timerId = window.setInterval(syncRemaining, 1000);
    return () => window.clearInterval(timerId);
  }, [effectiveRetryState.blockedUntil, localRetryBlockedUntil, teamRetryBlockedUntil]);

  const applyTeamRetryState = useCallback((payload: DialGuardPayload | null | undefined) => {
    if (!payload?.blockedUntil) {
      setTeamRetryBlockedUntil(null);
      setTeamRetryReason(null);
      return;
    }

    const blockedUntil = new Date(payload.blockedUntil).getTime();
    if (!Number.isFinite(blockedUntil) || blockedUntil <= Date.now()) {
      setTeamRetryBlockedUntil(null);
      setTeamRetryReason(null);
      return;
    }

    setTeamRetryBlockedUntil(blockedUntil);
    setTeamRetryReason(payload.reason === "PACE" || payload.reason === "THROTTLED" ? payload.reason : null);
  }, []);

  const refreshTeamDialGuard = useCallback(async () => {
    const response = await fetch("/api/connect/outbound-guard", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    }).catch(() => null);

    if (!response?.ok) return;
    const payload = (await response.json().catch(() => null)) as DialGuardPayload | null;
    applyTeamRetryState(payload);
  }, [applyTeamRetryState]);

  const reserveTeamDialSlot = useCallback(async () => {
    const response = await fetch("/api/connect/outbound-guard", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reserve" }),
    }).catch(() => null);

    if (!response?.ok) return null;
    const payload = (await response.json().catch(() => null)) as DialGuardPayload | null;
    applyTeamRetryState(payload);
    return payload;
  }, [applyTeamRetryState]);

  const reportTeamThrottle = useCallback(async () => {
    const response = await fetch("/api/connect/outbound-guard", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "throttle" }),
    }).catch(() => null);

    if (!response?.ok) return null;
    const payload = (await response.json().catch(() => null)) as DialGuardPayload | null;
    applyTeamRetryState(payload);
    return payload;
  }, [applyTeamRetryState]);

  const updateActiveContactId = useCallback((contactId: string | null) => {
    activeContactIdRef.current = contactId;
    setActiveContactId(contactId);
  }, []);

  const clearLiveCallState = useCallback(() => {
    setCallActive(false);
    setCallSeconds(0);
  }, []);

  const clearTrackedContact = useCallback(() => {
    activeContactRef.current = null;
    updateActiveContactId(null);
  }, [updateActiveContactId]);

  const markContactConnecting = useCallback(
    (contact: ConnectContact) => {
      activeContactRef.current = contact;
      const contactId = getContactId(contact);
      if (contactId) {
        updateActiveContactId(contactId);
      }
      setCallError(null);
      clearLiveCallState();
      setCallStatus("connecting");
    },
    [clearLiveCallState, updateActiveContactId],
  );

  const markContactConnected = useCallback(
    (contact: ConnectContact, resetTimer = false) => {
      activeContactRef.current = contact;
      const contactId = getContactId(contact);
      if (contactId) {
        updateActiveContactId(contactId);
      }
      setCallError(null);
      if (resetTimer || callStatus !== "connected") {
        setCallSeconds(0);
      }
      setCallActive(true);
      setCallStatus("connected");
    },
    [callStatus, updateActiveContactId],
  );

  const markContactAfterCallWork = useCallback(
    (contact: ConnectContact) => {
      activeContactRef.current = contact;
      const contactId = getContactId(contact);
      if (contactId) {
        updateActiveContactId(contactId);
      }
      clearLiveCallState();
      setCallError(null);
      setCallStatus("acw");
    },
    [clearLiveCallState, updateActiveContactId],
  );

  const resetCallState = useCallback(() => {
    clearLiveCallState();
    clearTrackedContact();
    setCallStatus("idle");
  }, [clearLiveCallState, clearTrackedContact]);

  const blockSoftphoneInThisTab = useCallback(() => {
    if (isInitialized.current) return;

    setAgent(null);
    setCcpReady(false);
    setConnectionStatus("blocked");
    setCallError(null);
    setCallStatus("idle");
  }, []);

  const releaseSoftphoneTabControl = useCallback(() => {
    if (typeof window === "undefined") return;

    const tabId = tabIdRef.current;
    const currentLock = readSoftphoneTabLock();
    if (tabId && currentLock?.tabId === tabId) {
      window.localStorage.removeItem(CCP_TAB_LOCK_KEY);
    }
  }, []);

  const syncSoftphoneTabControl = useCallback(
    (preferTakeover = false) => {
      if (typeof window === "undefined") return false;

      const existingTabId = window.sessionStorage.getItem(CCP_TAB_ID_STORAGE_KEY);
      if (!tabIdRef.current) {
        tabIdRef.current = existingTabId || createTabId();
      }
      if (!existingTabId) {
        window.sessionStorage.setItem(CCP_TAB_ID_STORAGE_KEY, tabIdRef.current);
      }

      const tabId = tabIdRef.current;
      const currentLock = readSoftphoneTabLock();
      const now = Date.now();
      const canTakeControl = !currentLock || currentLock.expiresAt <= now || currentLock.tabId === tabId;
      const shouldTakeControl = canTakeControl && (preferTakeover || document.visibilityState === "visible" || currentLock?.tabId === tabId);

      if (shouldTakeControl) {
        writeSoftphoneTabLock({
          tabId,
          expiresAt: now + CCP_TAB_LOCK_TTL_MS,
        });
        setTabHasSoftphoneControl(true);
        if (!isInitialized.current) {
          setConnectionStatus("loading");
        }
        return true;
      }

      setTabHasSoftphoneControl(false);
      blockSoftphoneInThisTab();
      return false;
    },
    [blockSoftphoneInThisTab],
  );

  const syncAgentState = useCallback((nextAgentState: ConnectAgentState | null | undefined) => {
    setAgentStateLabel(getAgentStateLabel(nextAgentState));
    setAgentReadyForOutbound(isAgentReadyState(nextAgentState));
  }, []);

  const syncTrackedContactStatus = useCallback(
    (contact: ConnectContact | null | undefined) => {
      if (!contact) return;

      if (isClearedContact(contact)) {
        if (activeContactRef.current === contact || getContactId(contact) === activeContactIdRef.current) {
          resetCallState();
        }
        return;
      }

      const contactStateLabel = getContactStateLabel(contact);
      if (isAfterCallWorkStateLabel(contactStateLabel)) {
        markContactAfterCallWork(contact);
        return;
      }

      if (isConnectedContact(contact)) {
        markContactConnected(contact);
        return;
      }

      if (isConnectingContact(contact)) {
        markContactConnecting(contact);
      }
    },
    [markContactAfterCallWork, markContactConnected, markContactConnecting, resetCallState],
  );

  const attachContactListeners = useCallback(
    (contact: ConnectContact) => {
      syncTrackedContactStatus(contact);
      const contactObject = contact as object;
      if (observedContactsRef.current.has(contactObject)) return;
      observedContactsRef.current.add(contactObject);

      contact.onConnecting?.(() => {
        markContactConnecting(contact);
      });
      contact.onConnected?.(() => {
        markContactConnected(contact, true);
      });
      contact.onACW?.(() => {
        markContactAfterCallWork(contact);
      });
      contact.onRefresh?.(() => {
        syncTrackedContactStatus(contact);
      });
      contact.onEnded?.(() => {
        if (activeContactRef.current !== contact && getContactId(contact) !== activeContactIdRef.current) {
          return;
        }

        syncTrackedContactStatus(contact);
      });
      contact.onDestroy?.(() => {
        if (activeContactRef.current !== contact && getContactId(contact) !== activeContactIdRef.current) {
          return;
        }

        resetCallState();
      });
    },
    [markContactAfterCallWork, markContactConnected, markContactConnecting, resetCallState, syncTrackedContactStatus],
  );

  const getLatestTrackedContact = useCallback(() => {
    const trackedContactId = activeContactIdRef.current;
    const fallbackContact = activeContactRef.current;
    const availableContacts = agent?.getContacts?.() ?? [];

    const latestTrackedContact =
      (trackedContactId
        ? availableContacts.find((contact) => getContactId(contact) === trackedContactId && !isClearedContact(contact))
        : null) ??
      (getContactId(fallbackContact)
        ? availableContacts.find((contact) => getContactId(contact) === getContactId(fallbackContact) && !isClearedContact(contact))
        : null) ??
      availableContacts.find((contact) => !isClearedContact(contact)) ??
      (fallbackContact && !isClearedContact(fallbackContact) ? fallbackContact : null);

    if (latestTrackedContact) {
      activeContactRef.current = latestTrackedContact;
      attachContactListeners(latestTrackedContact);
    }

    return latestTrackedContact;
  }, [agent, attachContactListeners]);

  const handleScreenPop = useCallback(
    async (incomingNumber: string) => {
      try {
        const response = await fetch("/api/leads?scope=all");
        if (!response.ok) return;
        const payload = (await response.json()) as {
          leads?: Array<{ id?: string; phone?: string | null }>;
        };

        const normalizedIncoming = normalizePhone(incomingNumber);
        const matchedLead = payload.leads?.find((item) => normalizePhone(item.phone || "") === normalizedIncoming);

        if (matchedLead?.id) {
          router.push(`/leads/${matchedLead.id}`);
        }
      } catch {
        // No-op: keep the incoming overlay visible if lookup fails.
      }
    },
    [router],
  );

  useEffect(() => {
    const hideOverlayForMatchedRoute = incomingCall.active && incomingCall.number && pathname.includes("/leads/");
    if (hideOverlayForMatchedRoute) {
      setIncomingCall((previous) => ({ ...previous, active: false }));
    }
  }, [incomingCall.active, incomingCall.number, pathname]);

  useEffect(() => {
    const ownsSoftphone = syncSoftphoneTabControl(true);
    if (!ownsSoftphone) {
      blockSoftphoneInThisTab();
    }

    const intervalId = window.setInterval(() => {
      if (tabHasSoftphoneControl) {
        void syncSoftphoneTabControl(true);
        return;
      }

      if (document.visibilityState === "visible") {
        void syncSoftphoneTabControl(true);
      }
    }, CCP_TAB_LOCK_HEARTBEAT_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void syncSoftphoneTabControl(true);
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== CCP_TAB_LOCK_KEY) return;
      void syncSoftphoneTabControl(false);
    };

    const handlePageHide = () => {
      releaseSoftphoneTabControl();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      releaseSoftphoneTabControl();
    };
  }, [blockSoftphoneInThisTab, releaseSoftphoneTabControl, syncSoftphoneTabControl, tabHasSoftphoneControl]);

  const initializeStreams = useCallback(() => {
    if (isInitialized.current) return;

    const windowWithConnect = window as AmazonConnectWindow;
    const ccpContainer = ccpContainerRef.current;
    if (!windowWithConnect.connect?.core?.initCCP || !ccpContainer) return;

    try {
      isInitialized.current = true;
      setConnectionStatus("initializing");
      setCallError(null);
      windowWithConnect.connect.core.initCCP(ccpContainer, {
        ccpUrl: CCP_URL,
        loginPopup: true,
        loginPopupAutoClose: true,
        region: "us-west-2",
        softphone: { allowFramedSoftphone: true, disableRingtone: false },
      });
    } catch {
      isInitialized.current = false;
      setConnectionStatus("error");
      setCallError("Unable to initialize the Amazon Connect softphone.");
      return;
    }

    windowWithConnect.connect.agent?.((nextAgent) => {
      if (subscribedAgentRef.current === nextAgent) return;
      subscribedAgentRef.current = nextAgent;
      setAgent(nextAgent);
      setCcpReady(true);
      setConnectionStatus("ready");
      setCallError(null);
      syncAgentState(nextAgent.getState?.() ?? nextAgent.getStatus?.() ?? null);
      nextAgent.onStateChange?.((nextAgentState) => {
        syncAgentState(nextAgentState);
      });
      const existingAgentContact = nextAgent.getContacts?.()?.find((contact) => !isClearedContact(contact)) ?? null;
      if (existingAgentContact) {
        attachContactListeners(existingAgentContact);
      }
    });

    windowWithConnect.connect.contact?.((contact) => {
      if (!contact.isInbound?.()) return;

      attachContactListeners(contact);
      setCallError(null);
      setCallStatus("connecting");
      const incomingNumber = contact.getConnections?.()[0]?.getEndpoint?.().phoneNumber || "Unknown number";
      setIncomingCall({ active: true, number: incomingNumber, contactObj: contact });
      handleScreenPop(incomingNumber);
    });
  }, [attachContactListeners, handleScreenPop, syncAgentState]);

  const handleScriptLoad = useCallback(() => {
    setScriptReady(true);
  }, []);

  useEffect(() => {
    const windowWithConnect = window as AmazonConnectWindow;
    if (windowWithConnect.connect?.core?.initCCP) {
      setScriptReady(true);
    }
  }, []);

  useEffect(() => {
    if (!scriptReady || !tabHasSoftphoneControl) return;
    initializeStreams();
  }, [initializeStreams, scriptReady, tabHasSoftphoneControl]);

  useEffect(() => {
    if (!tabHasSoftphoneControl) return;

    void refreshTeamDialGuard();
    const intervalId = window.setInterval(() => {
      void refreshTeamDialGuard();
    }, 4_000);

    return () => window.clearInterval(intervalId);
  }, [refreshTeamDialGuard, tabHasSoftphoneControl]);

  useEffect(() => {
    if (callStatus === "idle") return;

    const intervalId = window.setInterval(() => {
      syncTrackedContactStatus(getLatestTrackedContact());
    }, 750);

    return () => window.clearInterval(intervalId);
  }, [callStatus, getLatestTrackedContact, syncTrackedContactStatus]);

  const startOutboundCall = useCallback(
    async (dialNumber: string) => {
      if (!agent || !dialNumber) return;
      const blockingAgentContact = agent
        .getContacts?.()
        ?.find((contact) => !isClearedContact(contact) && getContactId(contact) !== activeContactIdRef.current);

      if (effectiveRetryState.blockedUntil && effectiveRetryState.blockedUntil > Date.now()) {
        setCallError(getRetryStatusMessage(Math.max(retrySecondsRemaining, 1), effectiveRetryState.reason));
        return;
      }

      if (blockingAgentContact) {
        attachContactListeners(blockingAgentContact);
        syncTrackedContactStatus(blockingAgentContact);
        const blockingContactId = getContactId(blockingAgentContact);
        if (blockingContactId) {
          updateActiveContactId(blockingContactId);
        }
        setCallError("Amazon Connect still has another active or after-call-work contact open for this rep. Finish that contact before starting a new call.");
        return;
      }

      if (!agentReadyForOutbound) {
        setCallError(
          agentStateLabel
            ? `Amazon Connect is currently ${agentStateLabel}. Switch the rep back to a routable status before dialing.`
            : "Amazon Connect is not ready for outbound dialing yet.",
        );
        return;
      }

      const windowWithConnect = window as AmazonConnectWindow;
      const endpoint = windowWithConnect.connect?.Endpoint?.byPhoneNumber?.(dialNumber);

      if (!endpoint) {
        setCallError("The phone number could not be converted into a valid Amazon Connect endpoint.");
        return;
      }

      clearTrackedContact();
      clearLiveCallState();
      setCallError(null);
      setCallStatus("connecting");

      const dialReservation = await reserveTeamDialSlot();
      if (dialReservation && dialReservation.allowed === false) {
        resetCallState();
        const secondsRemaining = Math.max(Math.ceil((dialReservation.waitMs ?? 0) / 1000), 1);
        setCallError(getRetryStatusMessage(secondsRemaining, dialReservation.reason ?? null));
        return;
      }

      agent.connect?.(endpoint, {
        success: (contact) => {
          attachContactListeners(contact);
          markContactConnecting(contact);
          setCallError(null);
        },
        failure: (error) => {
          resetCallState();
          if (isThrottledConnectError(error)) {
            setLocalRetryBlockedUntil(Date.now() + 30_000);
            setLocalRetryReason("THROTTLED");
            void reportTeamThrottle();
          }
          setCallError(getConnectErrorMessage(error));
        },
      });
    },
    [
      agent,
      agentReadyForOutbound,
      agentStateLabel,
      attachContactListeners,
      clearLiveCallState,
      clearTrackedContact,
      effectiveRetryState.blockedUntil,
      effectiveRetryState.reason,
      markContactConnecting,
      resetCallState,
      retrySecondsRemaining,
      reportTeamThrottle,
      reserveTeamDialSlot,
      syncTrackedContactStatus,
      updateActiveContactId,
    ],
  );

  const endActiveCall = useCallback(() => {
    const contact = getLatestTrackedContact();
    if (!contact) {
      resetCallState();
      return;
    }

    const destroyableConnections = getDestroyableConnections(contact);
    if (destroyableConnections.length === 0) {
      setCallError("Amazon Connect could not find an active voice connection to end.");
      return;
    }

    setCallError(null);

    const tryDestroyConnection = (index: number) => {
      const connectionToDestroy = destroyableConnections[index];
      connectionToDestroy.destroy?.({
        success: () => {
          window.setTimeout(() => {
            syncTrackedContactStatus(contact);
          }, 250);
        },
        failure: (error) => {
          if (index + 1 < destroyableConnections.length) {
            tryDestroyConnection(index + 1);
            return;
          }

          setCallError(
            getConnectOperationErrorMessage(
              error,
              "Amazon Connect could not end the live call. Try once more or end it in the CCP if the contact is already closing.",
            ),
          );
        },
      });
    };

    tryDestroyConnection(0);
  }, [getLatestTrackedContact, resetCallState, syncTrackedContactStatus]);

  const sendCallDigit = useCallback((digit: string) => {
    const contact = getLatestTrackedContact();
    const targetConnection = getNonAgentConnection(contact);
    if (!targetConnection?.sendDigits) {
      setCallError("Amazon Connect does not have an active call leg ready for keypad tones.");
      return;
    }

    setCallError(null);
    targetConnection.sendDigits(digit, {
      failure: (error) => {
        setCallError(
          getConnectOperationErrorMessage(
            error,
            "Amazon Connect rejected that keypad tone. Try again while the live call is still connected.",
          ),
        );
      },
    });
  }, [getLatestTrackedContact]);

  const completeAfterCallWork = useCallback(() => {
    const waitForClearToFinish = (attemptsRemaining: number): Promise<boolean> =>
      new Promise((resolve) => {
        const latestContact = getLatestTrackedContact();
        if (!latestContact) {
          resetCallState();
          resolve(true);
          return;
        }

        if (isClearedContact(latestContact)) {
          resetCallState();
          resolve(true);
          return;
        }

        const latestStateLabel = getContactStateLabel(latestContact);
        syncTrackedContactStatus(latestContact);

        if (!isAfterCallWorkStateLabel(latestStateLabel)) {
          resolve(true);
          return;
        }

        if (attemptsRemaining <= 0) {
          setCallError("Amazon Connect is still holding the contact in after-call work.");
          resolve(false);
          return;
        }

        window.setTimeout(() => {
          void waitForClearToFinish(attemptsRemaining - 1).then(resolve);
        }, 300);
      });

    const tryClear = (attemptsRemaining: number): Promise<boolean> =>
      new Promise((resolve) => {
        const contact = getLatestTrackedContact();
        if (!contact) {
          resetCallState();
          resolve(true);
          return;
        }

        const contactStateLabel = getContactStateLabel(contact);
        if (isClearedContact(contact)) {
          resetCallState();
          resolve(true);
          return;
        }

        if (!isAfterCallWorkStateLabel(contactStateLabel)) {
          if (attemptsRemaining <= 0) {
            resolve(true);
            return;
          }

          window.setTimeout(() => {
            void tryClear(attemptsRemaining - 1).then(resolve);
          }, 300);
          return;
        }

        if (!contact.clear) {
          setCallError("Amazon Connect did not expose a clear action for this ACW contact.");
          resolve(false);
          return;
        }

        setCallError(null);
        contact.clear({
          success: () => {
            window.setTimeout(() => {
              void waitForClearToFinish(15).then(resolve);
            }, 250);
          },
          failure: (error) => {
            setCallError(
              getConnectOperationErrorMessage(error, "Amazon Connect could not clear after-call work for this contact."),
            );
            resolve(false);
          },
        });
      });

    return tryClear(10);
  }, [getLatestTrackedContact, resetCallState, syncTrackedContactStatus]);

  const acceptIncomingCall = useCallback(() => {
    setIncomingCall((previous) => ({ ...previous, active: false }));
  }, []);

  const declineIncomingCall = useCallback(() => {
    incomingCall.contactObj?.getInitialConnection?.()?.destroy?.();
    setIncomingCall({ active: false, number: "", contactObj: null });
  }, [incomingCall.contactObj]);

  const contextValue = useMemo(
    () => ({
      callActive,
      callSeconds,
      activeContactId,
      ccpReady,
      connectionStatus,
      callStatus,
      callError,
      agentStateLabel,
      agentReadyForOutbound,
      retrySecondsRemaining,
      retryStatusMessage,
      startOutboundCall,
      endActiveCall,
      sendCallDigit,
      completeAfterCallWork,
    }),
    [
      activeContactId,
      agentReadyForOutbound,
      agentStateLabel,
      callActive,
      callError,
      callSeconds,
      ccpReady,
      connectionStatus,
      callStatus,
      endActiveCall,
      retrySecondsRemaining,
      retryStatusMessage,
      sendCallDigit,
      startOutboundCall,
      completeAfterCallWork,
    ],
  );

  return (
    <AmazonConnectContext.Provider value={contextValue}>
      <Script src={STREAMS_SCRIPT} strategy="lazyOnload" onLoad={handleScriptLoad} />
      <div
        id="ccp-container"
        ref={ccpContainerRef}
        style={{ position: "absolute", width: "1px", height: "1px", top: "-9999px", left: "-9999px" }}
        aria-hidden="true"
      />
      {incomingCall.active ? (
        <div className="fixed inset-x-0 top-4 z-[80] mx-auto w-[min(560px,calc(100%-2rem))] rounded-2xl border border-emerald-400/30 bg-zinc-900/95 p-4 shadow-2xl shadow-emerald-950/40 backdrop-blur">
          <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Incoming Call</p>
          <p className="mt-1 text-lg font-semibold text-zinc-100">{incomingCall.number}</p>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={acceptIncomingCall}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400"
            >
              Open Lead
            </button>
            <button
              onClick={declineIncomingCall}
              className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20"
            >
              Decline
            </button>
          </div>
        </div>
      ) : null}
      {children}
    </AmazonConnectContext.Provider>
  );
}

export function useAmazonConnect() {
  const context = useContext(AmazonConnectContext);
  if (!context) {
    throw new Error("useAmazonConnect must be used within AmazonConnectProvider.");
  }

  return context;
}
