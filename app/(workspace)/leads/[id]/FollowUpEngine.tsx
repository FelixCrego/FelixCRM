import React, { useState } from 'react';

export default function FollowUpEngine() {
  // State Management
  const [taskTitle, setTaskTitle] = useState('');
  const [taskType, setTaskType] = useState('Call');
  const [taskDate, setTaskDate] = useState('');
  const [taskTime, setTaskTime] = useState('');
  
  // Dummy state for demonstration (replace with your DB fetch later)
  const [tasks, setTasks] = useState([
    { id: 1, title: 'Check in on the preview link', type: 'Call', date: '2026-03-06', time: '10:00 AM', status: 'pending' }
  ]);

  // Quick Date Setters
  const setQuickDate = (daysToAdd: number) => {
    const date = new Date();
    date.setDate(date.getDate() + daysToAdd);
    setTaskDate(date.toISOString().split('T')[0]);
  };

  const handleAddTask = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!taskTitle || !taskDate) return;
    
    setTasks([...tasks, {
      id: Date.now(),
      title: taskTitle,
      type: taskType,
      date: taskDate,
      time: taskTime || 'Anytime',
      status: 'pending'
    }]);
    
    // Reset form
    setTaskTitle('');
    setTaskDate('');
    setTaskTime('');
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 font-sans">
      
      {/* Header & Touchpoint Counter */}
      <div className="flex items-end justify-between mb-6 border-b border-zinc-800/80 pb-4">
        <div>
          <h3 className="text-white font-black uppercase tracking-widest text-sm flex items-center gap-2">
            <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Follow-up Engine
          </h3>
          <p className="text-xs text-zinc-400 mt-1">Never let a deal go cold.</p>
        </div>
        <div className="flex items-center gap-2 bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-800">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest">
            Touchpoints: <span className="text-emerald-400">2/7</span>
          </span>
        </div>
      </div>

      {/* Task Creator Form */}
      <form onSubmit={handleAddTask} className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-4 mb-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-[40px] pointer-events-none"></div>
        
        <div className="flex flex-col gap-4 relative z-10">
          {/* Top Row: Type & Title */}
          <div className="flex gap-3">
            <select 
              value={taskType}
              onChange={(e) => setTaskType(e.target.value)}
              className="w-32 bg-zinc-900 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer"
            >
              <option value="Call">📞 Call</option>
              <option value="Email">✉️ Email</option>
              <option value="SMS">💬 SMS</option>
              <option value="To-Do">📌 To-Do</option>
            </select>
            
            <input 
              type="text" 
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="What's the objective? (e.g., Ask for the close)"
              className="flex-1 bg-zinc-900 border border-zinc-700 text-white text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500 placeholder-zinc-500"
            />
          </div>

          {/* Bottom Row: Quick Dates, Custom Date/Time, & Submit */}
          <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
            {/* Quick Presets */}
            <div className="flex gap-2">
              <button type="button" onClick={() => setQuickDate(1)} className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold rounded-md transition-colors border border-zinc-700">Tomorrow</button>
              <button type="button" onClick={() => setQuickDate(3)} className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold rounded-md transition-colors border border-zinc-700">In 3 Days</button>
            </div>

            {/* Native Pickers (Styled) */}
            <div className="flex gap-2 flex-1">
              <input 
                type="date" 
                value={taskDate}
                onChange={(e) => setTaskDate(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs rounded-md px-3 py-2 focus:outline-none focus:border-indigo-500 [color-scheme:dark]"
              />
              <input 
                type="time" 
                value={taskTime}
                onChange={(e) => setTaskTime(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs rounded-md px-3 py-2 focus:outline-none focus:border-indigo-500 [color-scheme:dark]"
              />
            </div>

            {/* Submit */}
            <button 
              type="submit"
              className="shrink-0 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold uppercase tracking-wider px-5 py-2 rounded-md transition-colors shadow-[0_0_15px_rgba(79,70,229,0.3)]"
            >
              Lock It In
            </button>
          </div>
        </div>
      </form>

      {/* Scheduled Tasks Timeline */}
      <div>
        <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3">Upcoming Touchpoints</h4>
        
        {tasks.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-zinc-800 rounded-xl bg-zinc-950/50">
            <p className="text-sm text-zinc-500 font-medium">No follow-ups scheduled.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between bg-zinc-950 border border-zinc-800 hover:border-zinc-700 p-3 rounded-xl transition-colors group">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-lg">
                    {task.type === 'Call' ? '📞' : task.type === 'Email' ? '✉️' : task.type === 'SMS' ? '💬' : '📌'}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{task.title}</p>
                    <div className="flex items-center gap-2 text-xs text-zinc-500 mt-0.5">
                      <span className="font-mono">{task.date}</span>
                      <span>•</span>
                      <span>{task.time}</span>
                    </div>
                  </div>
                </div>
                {/* Done/Complete Checkmark Button */}
                <button className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-900 text-zinc-500 hover:bg-emerald-500/20 hover:text-emerald-400 border border-transparent hover:border-emerald-500/30 transition-all">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
