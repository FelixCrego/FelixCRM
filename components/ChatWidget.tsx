"use client";

import React, { useState, useRef, useEffect } from 'react';

type ChatMessage = {
  id: string;
  createdAt?: string;
  recipientId?: string | null;
  senderId: string;
  senderName: string;
  content: string;
};

type ChatUser = {
  id: string;
  name: string;
};

export default function ChatWidget() {
  // UI State
  const [isOpen, setIsOpen] = useState(false);
  const [activeChannel, setActiveChannel] = useState('sales_floor');
  const [inputValue, setInputValue] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  
  // Data State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const activePeerId = activeChannel === 'sales_floor' ? null : activeChannel;

  // Fetch users for DM channels
  useEffect(() => {
    const fetchUsers = async () => {
      const response = await fetch('/api/chat/users', { cache: 'no-store' });
      if (!response.ok) return;

      const payload = (await response.json()) as { users?: ChatUser[] };
      setUsers(Array.isArray(payload.users) ? payload.users : []);
    };

    fetchUsers().catch(() => undefined);
  }, []);

  // Fetch message history and poll for new messages.
  useEffect(() => {
    const fetchMessages = async () => {
      const query = activePeerId ? `?peerId=${encodeURIComponent(activePeerId)}` : '';
      const response = await fetch(`/api/chat/messages${query}`, { cache: 'no-store' });
      if (!response.ok) return;

      const payload = (await response.json()) as { messages?: ChatMessage[]; userId?: string };
      setMessages(Array.isArray(payload.messages) ? payload.messages : []);
      if (typeof payload.userId === 'string' && payload.userId) {
        setMyUserId(payload.userId);
      }
    };

    fetchMessages().catch(() => undefined);

    const timer = setInterval(() => {
      fetchMessages().catch(() => undefined);
    }, 2000);

    return () => clearInterval(timer);
  }, [activePeerId]);

  // Trigger notification count for unseen incoming updates.
  useEffect(() => {
    if (isOpen || !myUserId) return;
    const unseen = messages.filter((message) => message.senderId !== myUserId).length;
    if (unseen > unreadCount) {
      setUnreadCount(unseen);
    }
  }, [messages, isOpen, myUserId, unreadCount]);

  // Heartbeat while chat is open.
  useEffect(() => {
    if (!isOpen) return;
    const ping = () => fetch('/api/chat/presence', { method: 'GET', cache: 'no-store' }).catch(() => undefined);
    ping();
    const timer = setInterval(ping, 20_000);
    return () => {
      clearInterval(timer);
    };
  }, [isOpen]);

  // 3. Auto-scroll to bottom
  const currentMessages = messages;
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentMessages, isOpen]);

  // Handle opening chat and clearing notifications
  const toggleChat = () => {
    setIsOpen(!isOpen);
    if (!isOpen) setUnreadCount(0);
  };

  // 4. Send Message to Supabase
  const handleSendMessage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    setInputValue(''); // Optimistically clear input

    const response = await fetch('/api/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: inputValue,
        recipientId: activePeerId,
      }),
    });
    if (!response.ok) console.error('Error sending message:', await response.text());
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 font-sans flex flex-col items-end">
      
      {/* The Chat Window */}
      {isOpen && (
        <div className="mb-4 w-[600px] h-[500px] bg-[#0a0a0a]/95 backdrop-blur-xl border border-zinc-800/80 rounded-2xl shadow-2xl flex overflow-hidden animate-in slide-in-from-bottom-5 fade-in duration-300">
          
          <>
              {/* Sidebar (Conversations) */}
              <div className="w-48 bg-zinc-950 border-r border-zinc-800 flex flex-col">
                <div className="p-4 border-b border-zinc-800">
                  <h3 className="text-xs font-black text-white uppercase tracking-widest">Conversations</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  <button onClick={() => setActiveChannel('sales_floor')} className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${activeChannel === 'sales_floor' ? 'bg-indigo-500/20 text-indigo-400' : 'text-zinc-400 hover:bg-zinc-900'}`}># Sales Floor</button>
                  {users.map((user) => (
                    <button key={user.id} onClick={() => setActiveChannel(user.id)} className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors flex items-center gap-2 ${activeChannel === user.id ? 'bg-indigo-500/20 text-indigo-400' : 'text-zinc-400 hover:bg-zinc-900'}`}><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> {user.name}</button>
                  ))}
                </div>
              </div>

              {/* Main Chat Feed */}
              <div className="flex-1 flex flex-col">
                 {/* Feed Header */}
                 <div className="bg-zinc-900 border-b border-zinc-800 p-4 flex items-center justify-between">
                    <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span> 
                      {activeChannel === 'sales_floor' ? 'Sales Floor' : 'DM'}
                    </h3>
                    <button onClick={toggleChat} className="text-zinc-500 hover:text-white transition-colors">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                 </div>

                 {/* Messages Area */}
                 <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {currentMessages.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-zinc-500 text-sm italic">No messages yet. Start the floor.</div>
                    ) : (
                      currentMessages.map((msg) => {
                        const isMe = msg.senderId === myUserId;
                        return (
                          <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                            <div className="flex items-baseline gap-2 mb-1">
                              <span className={`text-[10px] font-bold ${isMe ? 'text-indigo-400' : 'text-zinc-500'}`}>{msg.senderName}</span>
                              <span className="text-[9px] text-zinc-600">
                                {new Date(msg.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <div className={`max-w-[85%] p-3 rounded-xl text-sm ${isMe ? 'bg-indigo-600 text-white rounded-tr-none shadow-[0_4px_15px_rgba(79,70,229,0.2)]' : 'bg-zinc-800 text-zinc-300 rounded-tl-none border border-zinc-700/50'}`}>
                              {msg.content}
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                 </div>

                 {/* Input Area */}
                 <div className="p-3 bg-zinc-900 border-t border-zinc-800">
                   <form onSubmit={handleSendMessage} className="flex gap-2">
                     <input type="text" value={inputValue} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value)} placeholder={`Message ${activeChannel}...`} className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all"/>
                     <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-lg transition-colors"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg></button>
                   </form>
                 </div>
              </div>
            </>

        </div>
      )}

      {/* Floating Toggle Button WITH NOTIFICATION BADGE */}
      <button onClick={toggleChat} className="relative w-14 h-14 bg-indigo-600 hover:bg-indigo-500 rounded-full shadow-[0_0_20px_rgba(79,70,229,0.4)] flex items-center justify-center text-white transition-all hover:scale-105 active:scale-95">
        
        {/* Unread Badge */}
        {unreadCount > 0 && !isOpen && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-lg border-2 border-[#0a0a0a] animate-bounce">
            {unreadCount}
          </span>
        )}

        {isOpen ? (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        ) : (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
        )}
      </button>

    </div>
  );
}
