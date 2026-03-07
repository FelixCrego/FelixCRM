import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

type FollowUpTask = {
  id: number;
  lead_id: string;
  lead_name: string;
  rep_id: string;
  title: string;
  type: string;
  due_date: string;
  due_time: string;
  status: 'pending' | 'completed';
};

const TOUCHPOINT_GOAL = 7;

const CADENCE_BLUEPRINT: Array<{ dayOffset: number; type: FollowUpTask['type']; title: string }> = [
  { dayOffset: 1, type: 'Call', title: 'Intro call + confirm decision-maker' },
  { dayOffset: 3, type: 'Email', title: 'Send proof/results recap' },
  { dayOffset: 6, type: 'SMS', title: 'Quick pulse check + urgency text' },
  { dayOffset: 9, type: 'Call', title: 'Handle objections live' },
  { dayOffset: 13, type: 'Email', title: 'Share offer + implementation path' },
  { dayOffset: 18, type: 'SMS', title: 'Last chance reminder' },
  { dayOffset: 24, type: 'Call', title: 'Final close attempt + next step' },
];

type FollowUpEngineProps = {
  leadId?: string;
  leadName?: string;
  currentRepId?: string;
  onTaskCompleted?: (task: FollowUpTask) => Promise<void> | void;
};

export default function FollowUpEngine({ leadId, leadName, currentRepId = 'rep_123', onTaskCompleted }: FollowUpEngineProps) {
  const [taskTitle, setTaskTitle] = useState('');
  const [taskType, setTaskType] = useState('Call');
  const [taskDate, setTaskDate] = useState('');
  const [taskTime, setTaskTime] = useState('');
  const [tasks, setTasks] = useState<FollowUpTask[]>([]);
  const [isBuildingCadence, setIsBuildingCadence] = useState(false);

  useEffect(() => {
    if (!leadId) return;
    const fetchLeadTasks = async () => {
      const query: any = supabase.from('follow_ups').select('*');
      const { data } = await query
        .eq('lead_id', leadId)
        .order('due_date', { ascending: true })
        .order('due_time', { ascending: true });
      if (data) setTasks(data as FollowUpTask[]);
    };
    fetchLeadTasks();
  }, [leadId]);

  const completedCount = tasks.filter((task) => task.status === 'completed').length;
  const pendingTasks = tasks.filter((task) => task.status === 'pending');
  const totalTouchpoints = tasks.length;
  const remainingToGoal = Math.max(TOUCHPOINT_GOAL - totalTouchpoints, 0);
  const progressPercent = Math.min((totalTouchpoints / TOUCHPOINT_GOAL) * 100, 100);

  const handleAddTask = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!taskTitle || !taskDate || !leadId) return;

    const newTask = {
      lead_id: leadId,
      lead_name: leadName || 'Unknown Lead',
      rep_id: currentRepId,
      title: taskTitle,
      type: taskType,
      due_date: taskDate,
      due_time: taskTime || '12:00',
      status: 'pending' as const,
    };

    setTasks(prev => [...prev, { ...newTask, id: Date.now() }]);
    setTaskTitle('');
    setTaskDate('');
    setTaskTime('');

    const { error } = await (supabase.from('follow_ups') as any).insert([newTask]);
    if (error) console.error('Error saving task:', error);
  };

  const completeTask = async (taskId: number) => {
    const completedTask = tasks.find((task) => task.id === taskId);
    setTasks(prev => prev.map((task) => (task.id === taskId ? { ...task, status: 'completed' } : task)));

    const { error } = await (supabase.from('follow_ups') as any).update({ status: 'completed' }).eq('id', taskId);
    if (error) {
      console.error('Error completing task:', error);
      return;
    }

    if (!completedTask || !onTaskCompleted) return;

    try {
      await onTaskCompleted(completedTask);
    } catch (noteError) {
      console.error('Error syncing completed task to notes:', noteError);
    }
  };

  const buildCadence = async () => {
    if (!leadId || remainingToGoal === 0) return;

    setIsBuildingCadence(true);

    const now = new Date();
    const seededTasks = CADENCE_BLUEPRINT.slice(totalTouchpoints, TOUCHPOINT_GOAL).map((step, index) => {
      const dueDate = new Date(now);
      dueDate.setDate(dueDate.getDate() + step.dayOffset + index);

      return {
        lead_id: leadId,
        lead_name: leadName || 'Unknown Lead',
        rep_id: currentRepId,
        title: step.title,
        type: step.type,
        due_date: dueDate.toISOString().split('T')[0],
        due_time: '10:00',
        status: 'pending' as const,
      };
    });

    if (!seededTasks.length) {
      setIsBuildingCadence(false);
      return;
    }

    const optimisticRows = seededTasks.map((task, index) => ({ ...task, id: Date.now() + index }));
    setTasks((previous) => [...previous, ...optimisticRows]);

    const { error } = await (supabase.from('follow_ups') as any).insert(seededTasks);
    if (error) {
      console.error('Error generating cadence:', error);
    }

    setIsBuildingCadence(false);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 font-sans">
      <div className="flex items-end justify-between mb-6 border-b border-zinc-800/80 pb-4">
        <div>
          <h3 className="text-white font-black uppercase tracking-widest text-sm flex items-center gap-2">
            <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Follow-up Engine
          </h3>
          <p className="text-xs text-zinc-400 mt-1">Hit 7 touchpoints to maximize close rate and keep momentum high.</p>
        </div>
      </div>

      <div className="mb-5 rounded-xl border border-indigo-400/25 bg-indigo-500/10 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-wider text-indigo-200">Rep Momentum Tracker</p>
            <p className="mt-1 text-sm font-semibold text-white">{totalTouchpoints}/{TOUCHPOINT_GOAL} touchpoints scheduled • {completedCount} completed</p>
            <p className="mt-1 text-xs text-indigo-100/80">
              {remainingToGoal === 0
                ? 'You reached the full cadence. Keep pressure with personalized follow-ups.'
                : `${remainingToGoal} more touchpoint${remainingToGoal > 1 ? 's' : ''} to lock in a complete follow-up plan.`}
            </p>
          </div>
          <button
            type="button"
            onClick={buildCadence}
            disabled={isBuildingCadence || remainingToGoal === 0}
            className="rounded-md border border-indigo-300/40 bg-indigo-500/20 px-3 py-2 text-xs font-bold uppercase tracking-wide text-indigo-100 transition hover:bg-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isBuildingCadence ? 'Building Cadence...' : remainingToGoal === 0 ? 'Cadence Complete' : `Auto-build next ${remainingToGoal}`}
          </button>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-900">
          <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <form onSubmit={handleAddTask} className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-4 mb-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-[40px] pointer-events-none"></div>
        <div className="flex flex-col gap-4 relative z-10">
          <div className="flex flex-col gap-3 sm:flex-row">
            <select value={taskType} onChange={(e) => setTaskType(e.target.value)} className="w-full sm:w-32 bg-zinc-900 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer">
              <option value="Call">📞 Call</option>
              <option value="Email">✉️ Email</option>
              <option value="SMS">💬 SMS</option>
              <option value="To-Do">📌 To-Do</option>
            </select>
            <input type="text" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Objective (e.g., Ask for the close)" className="flex-1 bg-zinc-900 border border-zinc-700 text-white text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500 placeholder-zinc-500"/>
          </div>
          <div className="grid gap-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="rounded-lg border border-zinc-700 bg-zinc-900/80 p-2">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">📅 Follow-up Date</span>
                <input type="date" value={taskDate} onChange={(e) => setTaskDate(e.target.value)} required className="h-9 w-full min-w-0 bg-zinc-950 border border-zinc-700 text-zinc-200 text-sm rounded-md px-3 focus:outline-none focus:border-indigo-500 [color-scheme:dark]"/>
              </label>
              <label className="rounded-lg border border-zinc-700 bg-zinc-900/80 p-2">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">⏰ Follow-up Time</span>
                <input type="time" value={taskTime} onChange={(e) => setTaskTime(e.target.value)} required className="h-9 w-full min-w-0 bg-zinc-950 border border-zinc-700 text-zinc-200 text-sm rounded-md px-3 focus:outline-none focus:border-indigo-500 [color-scheme:dark]"/>
              </label>
            </div>
            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-md shadow-[0_0_15px_rgba(79,70,229,0.3)]">Lock It In</button>
          </div>
        </div>
      </form>

      <div>
        <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3">Pending Touchpoints</h4>
        {pendingTasks.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-zinc-800 rounded-xl bg-zinc-950/50"><p className="text-sm text-zinc-500 font-medium">No follow-ups scheduled.</p></div>
        ) : (
          <div className="space-y-3">
            {pendingTasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between bg-zinc-950 border border-zinc-800 p-3 rounded-xl">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-lg">{task.type === 'Call' ? '📞' : task.type === 'Email' ? '✉️' : task.type === 'SMS' ? '💬' : '📌'}</div>
                  <div>
                    <p className="text-sm font-bold text-white">{task.title}</p>
                    <p className="text-xs text-zinc-500 mt-0.5"><span className="font-mono">{task.due_date}</span> • {task.due_time}</p>
                  </div>
                </div>
                <button onClick={() => completeTask(task.id)} className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-900 text-zinc-500 hover:bg-emerald-500/20 hover:text-emerald-400 border border-transparent hover:border-emerald-500/30 transition-all" title="Mark Complete">
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
