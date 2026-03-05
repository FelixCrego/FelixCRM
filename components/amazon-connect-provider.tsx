"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Script from "next/script";

type ConnectContact = {
  isInbound?: () => boolean;
  onConnected?: (callback: () => void) => void;
  onEnded?: (callback: () => void) => void;
  sendDigit?: (digit: string) => void;
  getConnections?: () => Array<{ getEndpoint?: () => { phoneNumber?: string } }>;
  getInitialConnection?: () => { destroy?: () => void };
};

type ConnectAgent = {
  connect?: (
    endpoint: { phoneNumber: string },
    callbacks?: { success?: (contact: ConnectContact) => void; failure?: (error: unknown) => void },
  ) => void;
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
  ccpReady: boolean;
  connectionStatus: "loading" | "initializing" | "ready" | "error";
  callStatus: "idle" | "connecting" | "connected";
  startOutboundCall: (dialNumber: string) => void;
  endActiveCall: () => void;
  sendCallDigit: (digit: string) => void;
};

const AmazonConnectContext = createContext<AmazonConnectContextValue | null>(null);

const CCP_URL = "https://felix-outbound.my.connect.aws/ccp-v2";
const STREAMS_SCRIPT = "https://cdn.jsdelivr.net/npm/amazon-connect-streams/release/connect-streams-min.js";

function normalizePhone(value: string) {
  return value.replace(/\D/g, "").slice(-10);
}

export function AmazonConnectProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const ccpContainerRef = useRef<HTMLDivElement | null>(null);
  const isInitialized = useRef(false);
  const activeContactRef = useRef<ConnectContact | null>(null);
  const [agent, setAgent] = useState<ConnectAgent | null>(null);
  const [callActive, setCallActive] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [ccpReady, setCcpReady] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"loading" | "initializing" | "ready" | "error">("loading");
  const [callStatus, setCallStatus] = useState<"idle" | "connecting" | "connected">("idle");
  const [incomingCall, setIncomingCall] = useState<IncomingCall>({ active: false, number: "", contactObj: null });
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    if (!callActive) return;

    const timerId = window.setInterval(() => {
      setCallSeconds((previous) => previous + 1);
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [callActive]);

  const attachContactListeners = useCallback((contact: ConnectContact) => {
    activeContactRef.current = contact;
    contact.onConnected?.(() => {
      setCallActive(true);
      setCallSeconds(0);
      setCallStatus("connected");
    });
    contact.onEnded?.(() => {
      setCallActive(false);
      setCallSeconds(0);
      setCallStatus("idle");
      activeContactRef.current = null;
    });
  }, []);

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

  const initializeStreams = useCallback(() => {
    if (isInitialized.current) return;

    const windowWithConnect = window as AmazonConnectWindow;
    const ccpContainer = ccpContainerRef.current;
    if (!windowWithConnect.connect?.core?.initCCP || !ccpContainer) return;

    try {
      isInitialized.current = true;
      setConnectionStatus("initializing");
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
      return;
    }

    windowWithConnect.connect.agent?.((nextAgent) => {
      setAgent(nextAgent);
      setCcpReady(true);
      setConnectionStatus("ready");
    });

    windowWithConnect.connect.contact?.((contact) => {
      attachContactListeners(contact);
      if (contact.isInbound?.()) {
        setCallStatus("connecting");
        const incomingNumber = contact.getConnections?.()[0]?.getEndpoint?.().phoneNumber || "Unknown number";
        setIncomingCall({ active: true, number: incomingNumber, contactObj: contact });
        handleScreenPop(incomingNumber);
      }
    });
  }, [attachContactListeners, handleScreenPop]);

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
    if (!scriptReady) return;
    initializeStreams();
  }, [initializeStreams, scriptReady]);

  const startOutboundCall = useCallback(
    (dialNumber: string) => {
      if (!agent || !dialNumber) return;
      const windowWithConnect = window as AmazonConnectWindow;
      const endpoint = windowWithConnect.connect?.Endpoint?.byPhoneNumber?.(dialNumber);

      if (!endpoint) return;

      setCallStatus("connecting");
      agent.connect?.(endpoint, {
        success: (contact) => {
          attachContactListeners(contact);
          setCallActive(true);
          setCallSeconds(0);
        },
        failure: () => setCallStatus("idle"),
      });
    },
    [agent, attachContactListeners],
  );

  const endActiveCall = useCallback(() => {
    activeContactRef.current?.getInitialConnection?.()?.destroy?.();
    setCallActive(false);
    setCallStatus("idle");
  }, []);

  const sendCallDigit = useCallback((digit: string) => {
    activeContactRef.current?.sendDigit?.(digit);
  }, []);

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
      ccpReady,
      connectionStatus,
      callStatus,
      startOutboundCall,
      endActiveCall,
      sendCallDigit,
    }),
    [callActive, callSeconds, ccpReady, connectionStatus, callStatus, endActiveCall, sendCallDigit, startOutboundCall],
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
