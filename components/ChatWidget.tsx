"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  createdAt: string;
};

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [activeUserId, setActiveUserId] = useState<string>("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const loadMessages = useCallback(async () => {
    const response = await fetch("/api/chat/messages?limit=200", { cache: "no-store" });
    if (!response.ok) return;

    const payload = (await response.json()) as { messages?: ChatMessage[]; userId?: string };
    setMessages(payload.messages ?? []);
    if (payload.userId) setActiveUserId(payload.userId);
  }, []);

  const heartbeatPresence = useCallback(async () => {
    const response = await fetch("/api/chat/presence", { cache: "no-store" });
    if (!response.ok) return;

    const payload = (await response.json()) as { onlineCount?: number };
    setOnlineCount(payload.onlineCount ?? 0);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    loadMessages();
    heartbeatPresence();

    const syncInterval = window.setInterval(() => {
      loadMessages();
      heartbeatPresence();
    }, 2500);

    return () => window.clearInterval(syncInterval);
  }, [heartbeatPresence, isOpen, loadMessages]);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  const handleSendMessage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!inputValue.trim() || isSending) return;

    const optimisticId = `temp-${Date.now()}`;
    const optimisticMessage: ChatMessage = {
      id: optimisticId,
      senderId: activeUserId,
      senderName: "Me",
      content: inputValue,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    const outboundContent = inputValue;
    setInputValue("");
    setIsSending(true);

    const response = await fetch("/api/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: outboundContent }),
    });

    setIsSending(false);

    if (!response.ok) {
      setMessages((prev) => prev.filter((message) => message.id !== optimisticId));
      return;
    }

    await loadMessages();
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end font-sans">
      {isOpen && (
        <div className="animate-in slide-in-from-bottom-5 fade-in mb-4 flex h-[500px] w-80 flex-col overflow-hidden rounded-2xl border border-zinc-800/80 bg-[#0a0a0a]/95 shadow-2xl backdrop-blur-xl duration-300 sm:w-96">
          <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900 p-4">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <h3 className="text-sm font-black uppercase tracking-widest text-white">Sales Floor</h3>
              <span className="ml-2 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">{onlineCount} Online</span>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-zinc-500 transition-colors hover:text-white" aria-label="Close chat widget">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.map((msg) => {
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
                placeholder="Message the floor..."
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
      )}

      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Open global chat"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-[0_0_20px_rgba(79,70,229,0.4)] transition-all hover:scale-105 hover:bg-indigo-500 active:scale-95"
      >
        {isOpen ? (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        ) : (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
        )}
      </button>
    </div>
  );
}
