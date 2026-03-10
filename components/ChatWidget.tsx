"use client";

import React, { useState, useRef, useEffect } from 'react';
// IMPORTANT: Adjust this import to match your actual Supabase client path
import { supabase } from '@/lib/supabaseClient'; 

type ChatMessage = {
  id: string;
  created_at?: string;
  channel: string;
  sender: string;
  content: string;
};

export default function ChatWidget() {
  // UI State
  const [isOpen, setIsOpen] = useState(false);
  const [activeChannel, setActiveChannel] = useState('sales_floor');
  const [inputValue, setInputValue] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  
  // Data State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [username, setUsername] = useState('');
  const [isNameSet, setIsNameSet] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // 1. Check for existing username on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedName = localStorage.getItem('crm_chat_username');
      if (savedName) {
        setUsername(savedName);
        setIsNameSet(true);
      }
    }
  }, []);

  const handleSaveUsername = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!username.trim()) return;
    localStorage.setItem('crm_chat_username', username.trim());
    setIsNameSet(true);
  };

  // 2. Fetch History & Subscribe to Realtime (Only if name is set)
  useEffect(() => {
    if (!isNameSet) return;

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from<ChatMessage>('chat_messages')
        .select('*')
        .order('created_at', { ascending: true });
        
      if (data) setMessages(data);
      if (error) console.error("Error fetching messages:", error);
    };

    fetchMessages();

    const channel = supabase
      .channel<ChatMessage>('public:chat_messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload: { new: ChatMessage }) => {
          const newMessage = payload.new;
          setMessages((prev) => [...prev, newMessage]);
          
          // Trigger notification if the message wasn't sent by me
          if (newMessage.sender !== username) {
            setUnreadCount((prev) => isOpen ? prev : prev + 1);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isNameSet, isOpen, username]);

  // 3. Auto-scroll to bottom
  const currentMessages = messages.filter((msg) => msg.channel === activeChannel);
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
    if (!inputValue.trim() || !username) return;

    const newMsg = {
      channel: activeChannel,
      sender: username,
      content: inputValue,
    };

    setInputValue(''); // Optimistically clear input
    
    const { error } = await supabase.from<ChatMessage>('chat_messages').insert([newMsg]);
    if (error) console.error("Error sending message:", error);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-1rem)] flex-col items-end font-sans sm:bottom-6 sm:right-6">
      
      {/* The Chat Window */}
      {isOpen && (
        <div className="mb-4 flex h-[min(70vh,500px)] w-[min(94vw,600px)] overflow-hidden rounded-2xl border border-zinc-800/80 bg-[#0a0a0a]/95 shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-5 fade-in duration-300">
          
          {!isNameSet ? (
            // Username Registration Screen
            <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
              <div className="absolute w-64 h-64 bg-indigo-500/10 rounded-full blur-[80px] pointer-events-none"></div>
              <h2 className="text-2xl font-black text-white uppercase tracking-tight relative z-10 mb-2">Join the Floor</h2>
              <p className="text-zinc-400 text-sm text-center mb-8 relative z-10">Enter your display name so the team knows who is crushing it.</p>
              
              <form onSubmit={handleSaveUsername} className="w-full max-w-xs relative z-10">
                <input 
                  type="text" 
                  value={username}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
                  placeholder="e.g. Dan (Manager)"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all mb-4"
                  autoFocus
                />
                <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-lg transition-colors">
                  Enter Chat
                </button>
              </form>
            </div>
          ) : (
            // The Normal Chat Interface
            <>
              {/* Sidebar (Conversations) */}
              <div className="hidden w-48 border-r border-zinc-800 bg-zinc-950 sm:flex sm:flex-col">
                <div className="p-4 border-b border-zinc-800">
                  <h3 className="text-xs font-black text-white uppercase tracking-widest">Conversations</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  <button onClick={() => setActiveChannel('sales_floor')} className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${activeChannel === 'sales_floor' ? 'bg-indigo-500/20 text-indigo-400' : 'text-zinc-400 hover:bg-zinc-900'}`}># Sales Floor</button>
                  <button onClick={() => setActiveChannel('codegym787')} className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors flex items-center gap-2 ${activeChannel === 'codegym787' ? 'bg-indigo-500/20 text-indigo-400' : 'text-zinc-400 hover:bg-zinc-900'}`}><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> codegym787</button>
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
                        const isMe = msg.sender === username;
                        return (
                          <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                            <div className="flex items-baseline gap-2 mb-1">
                              <span className={`text-[10px] font-bold ${isMe ? 'text-indigo-400' : 'text-zinc-500'}`}>{msg.sender}</span>
                              <span className="text-[9px] text-zinc-600">
                                {new Date(msg.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
          )}

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
