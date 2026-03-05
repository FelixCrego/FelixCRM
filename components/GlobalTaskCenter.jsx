import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient'; 

export default function GlobalTaskCenter({ currentRepId = 'rep_123' }) {
  const router = useRouter();
  const [tasks, setTasks] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activePopup, setActivePopup] = useState(null);

  useEffect(() => {
    const fetchTodayTasks = async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('follow_ups')
        .select('*')
        .eq('rep_id', currentRepId)
        .eq('due_date', today)
        .eq('status', 'pending');
      if (data) setTasks(data);
    };

    fetchTodayTasks();

    const channel = supabase.channel('global-tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'follow_ups', filter: `rep_id=eq.${currentRepId}` }, 
        () => fetchTodayTasks() 
      ).subscribe();

    return () => supabase.removeChannel(channel);
  }, [currentRepId]);

  useEffect(() => {
    const checkAlarms = () => {
      const now = new Date();
      const currentTimeString = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });

      const dueTask = tasks.find(t => t.due_time === currentTimeString && t.status === 'pending');
      
      if (dueTask && activePopup?.id !== dueTask.id) {
        setActivePopup(dueTask);
        setTimeout(() => setActivePopup(null), 20000); 
      }
    };

    const interval = setInterval(checkAlarms, 60000);
    checkAlarms(); 
    return () => clearInterval(interval);
  }, [tasks, activePopup]);

  const handleGoToLead = (leadId) => {
    setIsOpen(false);
    setActivePopup(null);
    router.push(`/leads/${leadId}`); 
  };

  return (
    <div className="relative font-sans z-50">
      <button onClick={() => setIsOpen(!isOpen)} className="relative p-2 text-zinc-400 hover:text-white transition-colors rounded-full hover:bg-zinc-800">
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
        {tasks.length > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-[9px] font-bold text-white border-2 border-zinc-950">
            {tasks.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-80 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2">
          <div className="bg-zinc-950 p-4 border-b border-zinc-800 flex justify-between items-center">
            <h3 className="text-white font-black uppercase tracking-widest text-xs">Today&apos;s Schedule</h3>
            <span className="text-[10px] text-zinc-500 font-mono">{new Date().toLocaleDateString()}</span>
          </div>
          
          <div className="max-h-96 overflow-y-auto p-2 space-y-2">
            {tasks.length === 0 ? (
              <p className="text-center text-xs text-zinc-500 py-6 italic">Inbox zero. You are caught up.</p>
            ) : (
              tasks.sort((a, b) => a.due_time.localeCompare(b.due_time)).map(task => (
                <div key={task.id} className="p-3 bg-zinc-950 border border-zinc-800 hover:border-indigo-500/50 rounded-lg transition-colors group">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{task.type === 'Call' ? '📞' : task.type === 'Email' ? '✉️' : '💬'}</span>
                      <h4 className="text-sm font-bold text-white leading-tight truncate">{task.lead_name}</h4>
                    </div>
                    <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">{task.due_time}</span>
                  </div>
                  <p className="text-xs text-zinc-400 mb-3 truncate">{task.title}</p>
                  <button onClick={() => handleGoToLead(task.lead_id)} className="w-full text-center py-1.5 bg-zinc-900 hover:bg-indigo-600 text-xs font-bold text-white uppercase tracking-wider rounded transition-colors">
                    Open Lead
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activePopup && (
        <div className="fixed bottom-6 right-6 w-80 bg-indigo-600 border border-indigo-400 rounded-xl shadow-[0_0_30px_rgba(79,70,229,0.5)] p-5 animate-in slide-in-from-right-8 fade-in duration-500 z-[100]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-xl animate-pulse">
              {activePopup.type === 'Call' ? '📞' : '✉️'}
            </div>
            <div>
              <p className="text-[10px] text-indigo-200 font-black uppercase tracking-widest">Time to Execute</p>
              <h4 className="text-white font-bold truncate max-w-[180px]">{activePopup.lead_name}</h4>
            </div>
          </div>
          <p className="text-sm text-indigo-100 mb-4">{activePopup.title}</p>
          <div className="flex gap-2">
            <button onClick={() => handleGoToLead(activePopup.lead_id)} className="flex-1 bg-white hover:bg-zinc-200 text-indigo-900 text-xs font-black uppercase tracking-widest py-2 rounded shadow-lg transition-colors">
              Execute Now
            </button>
            <button onClick={() => setActivePopup(null)} className="px-3 bg-indigo-500 hover:bg-indigo-400 text-white rounded transition-colors">
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
