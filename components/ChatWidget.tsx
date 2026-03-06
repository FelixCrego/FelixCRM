import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient'; // Adjust path if necessary

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [isNameSet, setIsNameSet] = useState(false);
  
  const [allMessages, setAllMessages] = useState([]);
  const [activeChat, setActiveChat] = useState('global'); // 'global' or a username
  const [inputValue, setInputValue] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  
  const messagesEndRef = useRef(null);

  // 1. Load Name
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('crm_chat_username');
      if (saved) {
        setUsername(saved);
        setIsNameSet(true);
      }
    }
  }, []);

  const handleSaveName = (e) => {
    e.preventDefault();
    if (!username.trim()) return;
    localStorage.setItem('crm_chat_username', username.trim());
    setIsNameSet(true);
  };

  // 2. Fetch & Subscribe
  useEffect(() => {
    if (!isNameSet) return;

    const fetchHistory = async () => {
      // Fetch global messages AND my DMs
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .or(`recipient.eq.global,recipient.eq.${username},sender.eq.${username}`)
        .order('created_at', { ascending: true });
      
      if (data) setAllMessages(data);
      if (error) console.error('Fetch error:', error);
    };
    fetchHistory();

    const subscription = supabase
      .channel('chat_channel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, 
        (payload) => {
          const newMsg = payload.new;
          // Only add to state if it's global or involves me
          if (newMsg.recipient === 'global' || newMsg.recipient === username || newMsg.sender === username) {
            setAllMessages((prev) => [...prev, newMsg]);
            
            // Notification logic
            if (newMsg.sender !== username && (!isOpen || activeChat !== (newMsg.recipient === 'global' ? 'global' : newMsg.sender))) {
              setUnreadCount((prev) => prev + 1);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [isNameSet, username, isOpen, activeChat]);

  // 3. Filter Messages for Active View
  const currentViewMessages = useMemo(() => {
    if (activeChat === 'global') {
      return allMessages.filter(m => m.recipient === 'global');
    }
    // DM logic: messages between me and the activeChat user
    return allMessages.filter(m => 
      (m.sender === username && m.recipient === activeChat) || 
      (m.sender === activeChat && m.recipient === username)
    );
  }, [allMessages, activeChat, username]);

  // Extract unique users I have DMs with
  const dmUsers = useMemo(() => {
    const users = new Set();
    allMessages.forEach(m => {
      if (m.recipient !== 'global') {
        if (m.sender === username) users.add(m.recipient);
        if (m.recipient === username) users.add(m.sender);
      }
    });
    return Array.from(users);
  }, [allMessages, username]);

  // 4. Auto-Scroll
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentViewMessages, isOpen]);

  const toggleChat = () => {
    setIsOpen(!isOpen);
    if (!isOpen) setUnreadCount(0);
  };

  // 5. Send Message
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!inputValue.trim() || !username) return;

    const newMsg = {
      sender: username,
      recipient: activeChat, // 'global' or the DM user's name
      content: inputValue
    };

    setInputValue(''); 

    const { error } = await supabase.from('chat_messages').insert([newMsg]);
    if (error) console.error('Send error:', error);
  };

  const startDM = (targetUser) => {
    if (targetUser === username) return; // Can't DM yourself
    setActiveChat(targetUser);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 font-sans flex flex-col items-end">
      
      {isOpen && (
        <div className="mb-4 w-[650px] h-[500px] bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex overflow-hidden animate-in slide-in-from-bottom-5 fade-in duration-300">
          
          {!isNameSet ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6">
              <h2 className="text-xl font-bold text-white mb-2">Identify Yourself</h2>
              <form onSubmit={handleSaveName} className="w-full max-w-xs">
                <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. Dan" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-white mb-4" autoFocus />
                <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded-lg">Enter Chat</button>
              </form>
            </div>
          ) : (
            <>
              {/* SIDEBAR */}
              <div className="w-48 bg-zinc-900 border-r border-zinc-800 flex flex-col">
                <div className="p-4 border-b border-zinc-800">
                  <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Channels</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  <button 
                    onClick={() => setActiveChat('global')} 
                    className={`w-full text-left px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${activeChat === 'global' ? 'bg-indigo-500/20 text-indigo-400' : 'text-zinc-400 hover:bg-zinc-800'}`}
                  >
                    # Sales Floor
                  </button>
                  
                  {dmUsers.length > 0 && (
                    <div className="pt-4 pb-1 px-3">
                      <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Direct Messages</h3>
                    </div>
                  )}
                  {dmUsers.map(user => (
                    <button 
                      key={user}
                      onClick={() => setActiveChat(user)} 
                      className={`w-full text-left px-3 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 ${activeChat === user ? 'bg-indigo-500/20 text-indigo-400' : 'text-zinc-400 hover:bg-zinc-800'}`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      {user}
                    </button>
                  ))}
                </div>
              </div>

              {/* MAIN CHAT AREA */}
              <div className="flex-1 flex flex-col bg-zinc-950">
                {/* HEADER */}
                <div className="bg-zinc-900 border-b border-zinc-800 p-4 flex justify-between items-center">
                  <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                    {activeChat === 'global' ? (
                      <><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Global Floor</>
                    ) : (
                      <><span className="text-zinc-500">@</span> {activeChat}</>
                    )}
                  </h3>
                  <button onClick={() => setIsOpen(false)} className="text-zinc-500 hover:text-white">✕</button>
                </div>

                {/* FEED */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {currentViewMessages.length === 0 ? (
                    <p className="text-zinc-500 text-center text-sm italic mt-10">No messages here yet.</p>
                  ) : (
                    currentViewMessages.map((msg) => {
                      const isMe = msg.sender === username;
                      return (
                        <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                          <span 
                            onClick={() => startDM(msg.sender)}
                            className={`text-[10px] font-bold mb-1 cursor-pointer hover:underline ${isMe ? 'text-indigo-400' : 'text-zinc-500 hover:text-zinc-300'}`}
                            title="Click to DM"
                          >
                            {msg.sender}
                          </span>
                          <div className={`max-w-[85%] p-3 rounded-xl text-sm ${isMe ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-zinc-800 text-zinc-200 rounded-tl-none border border-zinc-700/50'}`}>
                            {msg.content}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* INPUT */}
                <div className="p-3 bg-zinc-900 border-t border-zinc-800">
                  <form onSubmit={sendMessage} className="flex gap-2">
                    <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder={`Message ${activeChat === 'global' ? 'the floor' : activeChat}...`} className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500" />
                    <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold">→</button>
                  </form>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* FLOATING BUTTON WITH BADGE */}
      <button onClick={toggleChat} className="relative w-14 h-14 bg-indigo-600 hover:bg-indigo-500 rounded-full shadow-[0_0_20px_rgba(79,70,229,0.4)] flex items-center justify-center text-white transition-all hover:scale-105">
        {unreadCount > 0 && !isOpen && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-lg border-2 border-[#0a0a0a] animate-bounce">
            {unreadCount}
          </span>
        )}
        {isOpen ? '✕' : '💬'}
      </button>

    </div>
  );
}
