"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string | null;
  content: string;
  createdAt: string;
};

type ChatUser = {
  id: string;
  name: string;
  role: string;
  isOnline: boolean;
};

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  // 1. Load from LocalStorage (or default if empty)
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window !== "undefined") {
      const savedMessages = localStorage.getItem("crm_chat_history");
      if (savedMessages) {
        try {
          return JSON.parse(savedMessages) as ChatMessage[];
        } catch {
          localStorage.removeItem("crm_chat_history");
        }
      }
    }
    // Default fallback state
    return [
      {
        id: "1",
        senderId: "manager-dan",
        senderName: "Manager Dan",
        recipientId: null,
        content: "Who is covering the 3PM demo?",
        createdAt: new Date().toISOString(),
      },
      {
        id: "2",
        senderId: "codegym787",
        senderName: "codegym787",
        recipientId: null,
        content: "Hey, did you send that AWS link?",
        createdAt: new Date().toISOString(),
      },
    ];
  });
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);
  const [onlineCount, setOnlineCount] = useState(0);
  const [activeUserId, setActiveUserId] = useState<string>("");
  const [isSending, setIsSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messageRequestIdRef = useRef(0);
  const messagesRef = useRef<ChatMessage[]>([]);
  const isOpenRef = useRef(isOpen);
  const activeUserIdRef = useRef(activeUserId);
  const selectedPeerIdRef = useRef(selectedPeerId);

  const getMessageChannel = useCallback(
    (message: ChatMessage) => {
      if (message.recipientId === null) return "sales_floor";
      if (!activeUserIdRef.current) return message.recipientId;
      return message.senderId === activeUserIdRef.current ? message.recipientId : message.senderId;
    },
    [],
  );

  const activeChannel = selectedPeerId ?? "sales_floor";

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    activeUserIdRef.current = activeUserId;
  }, [activeUserId]);

  useEffect(() => {
    selectedPeerIdRef.current = selectedPeerId;
  }, [selectedPeerId]);

  // 2. Save to LocalStorage whenever messages change
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("crm_chat_history", JSON.stringify(messages));
    }
  }, [messages]);

  const loadMessages = useCallback(async (peerId?: string | null) => {
    const requestId = ++messageRequestIdRef.current;
    const params = new URLSearchParams();
    if (peerId) params.set("peerId", peerId);

    const endpoint = params.toString() ? `/api/chat/messages?${params.toString()}` : "/api/chat/messages";
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok || requestId !== messageRequestIdRef.current) return;

    const payload = (await response.json()) as { messages?: ChatMessage[]; userId?: string };
    if (requestId !== messageRequestIdRef.current) return;

    const incomingMessages = payload.messages ?? [];
    const previousMessages = messagesRef.current;
    const previousIds = new Set(previousMessages.map((message) => message.id));
    const newIncomingMessages = incomingMessages.filter(
      (message) => !previousIds.has(message.id) && message.senderId !== activeUserIdRef.current,
    );

    if (newIncomingMessages.length > 0) {
      const currentChannel = selectedPeerIdRef.current ?? "sales_floor";
      const shouldIncrementUnread = (message: ChatMessage) => {
        if (!isOpenRef.current || document.hidden) return true;
        return getMessageChannel(message) !== currentChannel;
      };

      const unreadIncrement = newIncomingMessages.filter(shouldIncrementUnread).length;
      if (unreadIncrement > 0) {
        setUnreadCount((prev) => prev + unreadIncrement);
      }

      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        const newestMessage = newIncomingMessages[newIncomingMessages.length - 1];
        new Notification(`New message from ${newestMessage.senderName}`, { body: newestMessage.content });
      }
    }

    const mergedById = new Map(previousMessages.map((message) => [message.id, message]));
    for (const message of incomingMessages) {
      mergedById.set(message.id, message);
    }
    const mergedMessages = Array.from(mergedById.values()).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    setMessages(mergedMessages);
    messagesRef.current = mergedMessages;

    if (payload.userId) setActiveUserId(payload.userId);
  }, [getMessageChannel]);

  const loadUsers = useCallback(async () => {
    const response = await fetch("/api/chat/users", { cache: "no-store" });
    if (!response.ok) return;

    const payload = (await response.json()) as { users?: ChatUser[] };
    setUsers(payload.users ?? []);
  }, []);

  const heartbeatPresence = useCallback(async () => {
    const response = await fetch("/api/chat/presence", { cache: "no-store" });
    if (!response.ok) return;

    const payload = (await response.json()) as { onlineCount?: number };
    setOnlineCount(payload.onlineCount ?? 0);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    loadMessages(selectedPeerId);
    loadUsers();
    heartbeatPresence();

    const syncInterval = window.setInterval(() => {
      loadMessages(selectedPeerId);
      loadUsers();
      heartbeatPresence();
    }, 2500);

    return () => window.clearInterval(syncInterval);
  }, [heartbeatPresence, isOpen, loadMessages, loadUsers, selectedPeerId]);

  const currentMessages = useMemo(
    () => messages.filter((message) => getMessageChannel(message) === activeChannel),
    [activeChannel, getMessageChannel, messages],
  );

  useEffect(() => {
    if (!isOpen || !messagesEndRef.current) return;
    messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [currentMessages, isOpen]);

  const handleSendMessage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!inputValue.trim() || isSending) return;

    const sendPeerId = selectedPeerId;
    const optimisticId = `temp-${Date.now()}`;
    const optimisticMessage: ChatMessage = {
      id: optimisticId,
      senderId: activeUserId,
      senderName: "Me",
      recipientId: sendPeerId,
      content: inputValue,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => {
      const next = [...prev, optimisticMessage];
      messagesRef.current = next;
      return next;
    });
    const outboundContent = inputValue;
    setInputValue("");
    setIsSending(true);

    const response = await fetch("/api/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: outboundContent, recipientId: sendPeerId }),
    });

    setIsSending(false);

    if (!response.ok) {
      setMessages((prev) => {
        const next = prev.filter((message) => message.id !== optimisticId);
        messagesRef.current = next;
        return next;
      });
      return;
    }

    await loadMessages(sendPeerId);
  };

  const toggleChat = () => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) setUnreadCount(0);
      return next;
    });
  };

  const selectedPeer = users.find((user) => user.id === selectedPeerId) ?? null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end font-sans">
      {isOpen && (
        <div className="animate-in slide-in-from-bottom-5 fade-in mb-4 flex h-[540px] w-[420px] overflow-hidden rounded-2xl border border-zinc-800/80 bg-[#0a0a0a]/95 shadow-2xl backdrop-blur-xl duration-300">
          <div className="flex w-40 flex-col border-r border-zinc-800 bg-zinc-950/90">
            <div className="border-b border-zinc-800 px-3 py-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-white">Conversations</h3>
              <p className="mt-1 text-[10px] text-zinc-500">{onlineCount} users online</p>
            </div>
            <div className="flex-1 space-y-1 overflow-y-auto p-2">
              <button
                onClick={() => setSelectedPeerId(null)}
                className={`w-full rounded-lg px-2 py-2 text-left text-xs transition-colors ${
                  selectedPeerId === null ? "bg-indigo-600/30 text-indigo-200" : "text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                # Sales Floor
              </button>
              {users.map((user) => (
                <button
                  key={user.id}
                  onClick={() => setSelectedPeerId(user.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs transition-colors ${
                    selectedPeerId === user.id ? "bg-indigo-600/30 text-indigo-200" : "text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${user.isOnline ? "bg-emerald-500" : "bg-zinc-600"}`} />
                  <span className="truncate">{user.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900 p-4">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <h3 className="text-sm font-black uppercase tracking-widest text-white">{selectedPeer ? `DM: ${selectedPeer.name}` : "Sales Floor"}</h3>
              </div>
              <button onClick={toggleChat} className="text-zinc-500 transition-colors hover:text-white" aria-label="Close chat widget">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {currentMessages.map((msg) => {
                const isMe = msg.senderId === activeUserId;
                return (
                  <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                    <div className="mb-1 flex items-baseline gap-2">
                      <span className={`text-[10px] font-bold ${isMe ? "text-indigo-400" : "text-zinc-500"}`}>{isMe ? "Me" : msg.senderName}</span>
                      <span className="text-[9px] text-zinc-600">{formatTimestamp(msg.createdAt)}</span>
                    </div>

                    <div className={`max-w-[85%] rounded-xl p-3 text-sm ${
                      isMe
                        ? "rounded-tr-none bg-indigo-600 text-white shadow-[0_4px_15px_rgba(79,70,229,0.2)]"
                        : "rounded-tl-none border border-zinc-700/50 bg-zinc-800/80 text-zinc-300"
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-zinc-800 bg-zinc-900 p-3">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={selectedPeer ? `Message ${selectedPeer.name}...` : "Message the floor..."}
                  className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white transition-all focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  disabled={isSending}
                  className="flex items-center justify-center rounded-lg bg-indigo-600 p-2 text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={toggleChat}
        aria-label="Open global chat"
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-[0_0_20px_rgba(79,70,229,0.4)] transition-all hover:scale-105 hover:bg-indigo-500 active:scale-95"
      >
        {unreadCount > 0 && !isOpen && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
        {isOpen ? (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        ) : (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
        )}
      </button>
    </div>
  );
}
