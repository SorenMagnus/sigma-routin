'use client';

import React, { useState, useEffect } from 'react';
import { Target, Circle, CheckCircle2, Plus, LogOut, X, Settings2, Trophy, Flame, Trash2, Clock, Crown } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { generateSigmaSchedule, FixedRoutine, FlexibleGoal, ScheduleBlock } from '@/lib/scheduler';
import confetti from 'canvas-confetti';

interface LeaderboardUser {
  user_id: string;
  username: string;
  points: number;
}

// 获取北京时间 YYYY-MM-DD
const getBeijingDateStr = () => {
  const formatter = new Intl.DateTimeFormat('en-CA', { 
    timeZone: 'Asia/Shanghai', 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit' 
  });
  return formatter.format(new Date()); 
};

// 赛季配置定数
const SEASON_CONFIG = {
  id: 1,
  name: "SEASON 1: THE INITIATION",
  start: "2026-03-18",
  end: "2026-06-17",
};

export default function SigmaDashboard({ user }: { user: any }) {
  const router = useRouter();
  const supabase = createClient();

  const [sigmaPoints, setSigmaPoints] = useState(0); 
  const [streak, setStreak] = useState(0); 
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [todayRoutines, setTodayRoutines] = useState<(ScheduleBlock & { completed?: boolean })[]>([]);
  const [earnedToday, setEarnedToday] = useState(0);
  
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Configuration State
  const [longTermGoals, setLongTermGoals] = useState<string[]>(['']);
  const [studyHours, setStudyHours] = useState<string>("");
  const [fitnessGoals, setFitnessGoals] = useState<string[]>(['']);
  const [hardBlocks, setHardBlocks] = useState<FixedRoutine[]>([]);

  useEffect(() => {
    initDashboard();

    // 绝对时间轴同步 (Calendar Sync): 跨过北京时间午夜强制刷新
    const startLogDate = getBeijingDateStr();
    const timer = setInterval(() => {
      if (getBeijingDateStr() !== startLogDate) {
        window.location.reload();
      }
    }, 60000);

    // 实时通讯塔 (Live Radar): 每 5 秒雷达扫描一次全球排位
    let isScanning = false;
    const radarTimer = setInterval(async () => {
      if (isScanning) return;
      isScanning = true;
      try {
        const { data: topUsers } = await supabase.rpc('get_season_leaderboard', { 
          season_start: SEASON_CONFIG.start, 
          season_end: SEASON_CONFIG.end 
        });
        if (topUsers) {
           setLeaderboard(topUsers.slice(0, 5));
           // 我们不在这里强制更新你自己的积分，防止打破前端渲染的流畅动画
        }
      } catch (e) {
        // 静默处理雷达错误
      } finally {
        isScanning = false;
      }
    }, 5000);

    return () => { 
      clearInterval(timer); 
      clearInterval(radarTimer);
    };
  }, []);

  const initDashboard = async () => {
    try {
      setLoading(true);
      const todayStr = getBeijingDateStr();

      // 1. 初始化当前用户
      const { data: userData, error: userErr } = await supabase.from('users').select('*').eq('id', user.id).single();
      if (userErr || !userData) {
        await supabase.from('users').insert({ id: user.id, username: user.user_metadata?.user_name || user.email?.split('@')[0] || 'Sigma User' });
      } else {
        setStreak(userData.current_streak || 0);
      }

      // 2. 加载赛季排行榜 (RPC Function Call)
      const { data: topUsers, error: rpcErr } = await supabase.rpc('get_season_leaderboard', { 
        season_start: SEASON_CONFIG.start, 
        season_end: SEASON_CONFIG.end 
      });
      
      if (!rpcErr && topUsers) {
        setLeaderboard(topUsers.slice(0, 5)); // 永远只取前 5
        // 当前用户的赛季积分提取
        const me = topUsers.find((u: any) => u.user_id === user.id);
        if (me) setSigmaPoints(me.points);
      } else {
        console.error("RPC Error (Requires SQL deployment):", rpcErr);
        // Fallback for UI if RPC not run yet
        setLeaderboard([{ user_id: 'x', username: 'AWAITING SQL DEPLOY', points: 0}]);
      }

      // 3. 永久化读取基础法则
      const { data: routines } = await supabase.from('routines').select('*').eq('user_id', user.id);

      if (routines && routines.length > 0) {
        const fixed: FixedRoutine[] = routines.filter(r => r.type === 'fixed').map(r => ({ id: r.id, title: r.title, startTime: r.start_time, endTime: r.end_time }));
        const flexible: FlexibleGoal[] = routines.filter(r => r.type === 'flexible' && !r.title.startsWith('[LONG-TERM]')).map(r => ({ id: r.id, title: r.title, totalDurationMinutes: r.duration_minutes, minChunkMinutes: r.min_chunk_minutes, priority: r.priority }));
        const loadedLongTerm = routines.filter(r => r.title.startsWith('[LONG-TERM]')).map(r => r.title.replace('[LONG-TERM] ', ''));
        if (loadedLongTerm.length > 0) setLongTermGoals(loadedLongTerm);

        // 完美复原用户的表单配置状态 (记住所有的增减设定)
        setHardBlocks(fixed);
        
        const focusBlock = flexible.find(r => r.title === 'FOCUS BLOCK');
        if (focusBlock) setStudyHours((focusBlock.totalDurationMinutes / 60).toString());

        const fitnessList = flexible.filter(r => r.title !== 'FOCUS BLOCK').map(r => r.title);
        if (fitnessList.length > 0) setFitnessGoals(fitnessList);

        // 4. 加载今日打卡记录 (Daily Logs)
        const { data: logs } = await supabase.from('daily_logs').select('id, completed_routines, custom_schedule, sigma_points_earned').eq('user_id', user.id).eq('log_date', todayStr).maybeSingle();
        
        let targetSchedule = [];
        const cIds = logs && logs.completed_routines ? JSON.parse(logs.completed_routines) : [];
        setEarnedToday(logs?.sigma_points_earned || 0);

        // 如果今日已经有自定义 schedule，则加载；否则使用算法生成初始版
        if (logs && logs.custom_schedule) {
           targetSchedule = JSON.parse(logs.custom_schedule);
        } else {
           targetSchedule = generateSigmaSchedule(fixed, flexible);
           // 立刻保存到 Custom Schedule 中，确保今日排班锁定并可编辑
           if (targetSchedule.length > 0) {
             await saveCustomScheduleToDB(targetSchedule, todayStr, cIds, logs?.sigma_points_earned || 0, logs?.id);
           }
        }

        // 映射 completed 状态
        setTodayRoutines(targetSchedule.map((s: any) => ({ ...s, completed: cIds.includes(s.id) })));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const saveCustomScheduleToDB = async (scheduleArray: any[], dateStr: string, cIds: string[], earned: number, existingLogId?: string) => {
    try {
      if (existingLogId) {
        await supabase.from('daily_logs').update({ custom_schedule: JSON.stringify(scheduleArray) }).eq('id', existingLogId);
      } else {
        const { data } = await supabase.from('daily_logs').insert({ 
          user_id: user.id, log_date: dateStr, 
          custom_schedule: JSON.stringify(scheduleArray), 
          completed_routines: JSON.stringify(cIds), 
          sigma_points_earned: earned 
        }).select('id').single();
      }
    } catch (e) {
      console.error("Save custom schedule error:", e);
    }
  };

  const handleCreateCustomBlock = () => {
    const newBlock: ScheduleBlock = {
      id: `custom-block-${Date.now()}`,
      title: 'FOCUS BLOCK',
      startMin: 480, endMin: 540,
      startTimeString: '08:00', endTimeString: '09:00',
      type: 'flexible_chunk'
    };
    const updated = [...todayRoutines, newBlock].sort((a,b) => a.startMin - b.startMin);
    setTodayRoutines(updated);
    
    // Persist
    const todayStr = getBeijingDateStr();
    supabase.from('daily_logs').update({ custom_schedule: JSON.stringify(updated) }).eq('user_id', user.id).eq('log_date', todayStr);
  };

  const handleDeleteBlock = (blockId: string) => {
    const updated = todayRoutines.filter(b => b.id !== blockId);
    setTodayRoutines(updated);
    const todayStr = getBeijingDateStr();
    supabase.from('daily_logs').update({ custom_schedule: JSON.stringify(updated) }).eq('user_id', user.id).eq('log_date', todayStr);
  };

  const handleTimeChange = (blockId: string, field: 'startTimeString' | 'endTimeString', value: string) => {
    const updated = todayRoutines.map(b => {
      if (b.id === blockId) {
        const timeVal = value || "00:00";
        const [h, m] = timeVal.split(':').map(Number);
        const mins = h * 60 + m;
        return { 
          ...b, 
          [field]: timeVal, 
          ...(field === 'startTimeString' ? { startMin: mins } : { endMin: mins })
        };
      }
      return b;
    }).sort((a,b) => a.startMin - b.startMin);
    
    setTodayRoutines(updated);
    // Note: Debouncing DB save might be better in prod, doing it immediately here for SaaS stability
    const todayStr = getBeijingDateStr();
    supabase.from('daily_logs').update({ custom_schedule: JSON.stringify(updated) }).eq('user_id', user.id).eq('log_date', todayStr);
  };

  const toggleTask = async (id: string, isCompletedCurrently: boolean) => {
    const todayStr = getBeijingDateStr();
    const newStatus = !isCompletedCurrently;
    const currentCompletedIds = todayRoutines.filter(t => t.completed).map(t => t.id);
    const newCompletedIds = newStatus ? [...currentCompletedIds, id] : currentCompletedIds.filter(i => i !== id);
    
    setTodayRoutines(todayRoutines.map(t => t.id === id ? { ...t, completed: newStatus } : t));

    // 计算防作弊阶梯积分
    const total = todayRoutines.length;
    const completedCount = newCompletedIds.length;
    const percentage = total === 0 ? 0 : (completedCount / total) * 100;

    let newEarned = 0;
    if (percentage >= 100) newEarned = 100;
    else if (percentage >= 75) newEarned = 75;
    else if (percentage >= 50) newEarned = 50;
    else if (percentage >= 25) newEarned = 25;

    const pointsDiff = newEarned - earnedToday;

    // 只有在越级加分时触发奖励反馈
    if (pointsDiff > 0) {
      confetti({ particleCount: 100 + newEarned, spread: 120, origin: { y: 0.6 }, colors: ['#10B981', '#3B82F6', '#F59E0B'], disableForReducedMotion: true });
    }

    setEarnedToday(newEarned); 
    setSigmaPoints(sigmaPoints + pointsDiff); 

    try {
      const { data: existingLog } = await supabase.from('daily_logs').select('id, sigma_points_earned').eq('user_id', user.id).eq('log_date', todayStr).maybeSingle();

      if (existingLog) {
         await supabase.from('daily_logs').update({ completed_routines: JSON.stringify(newCompletedIds), sigma_points_earned: newEarned }).eq('id', existingLog.id);
      } else {
         await supabase.from('daily_logs').insert({ user_id: user.id, log_date: todayStr, completed_routines: JSON.stringify(newCompletedIds), sigma_points_earned: newEarned });
      }

      // 如果积分发生改变（无论增加还是减少），实时同步至大盘
      if (pointsDiff !== 0) {
        const { data: currentUserRow } = await supabase.from('users').select('sigma_points_total').eq('id', user.id).single();
        const safeUpdatedPoints = Math.max(0, (currentUserRow?.sigma_points_total || 0) + pointsDiff); // 确保积分不为负数
        await supabase.from('users').update({ sigma_points_total: safeUpdatedPoints }).eq('id', user.id);
        
        // 刷新排行榜
        const { data: topUsers } = await supabase.rpc('get_season_leaderboard', { season_start: SEASON_CONFIG.start, season_end: SEASON_CONFIG.end });
        if (topUsers) setLeaderboard(topUsers);
      }
    } catch (e) {
      console.error("Sync failed", e);
    }
  };

  const generateRoutineConfig = async () => {
    setIsModalOpen(false);
    setLoading(true);

    const filteredGoals = longTermGoals.filter(goal => goal.trim() !== "");
    const filteredFitness = fitnessGoals.filter(goal => goal.trim() !== "");

    const toInsert = [];
    const validFixed = hardBlocks.filter(b => b.title.trim() !== '' && b.startTime && b.endTime);
    validFixed.forEach(b => {
      toInsert.push({ user_id: user.id, type: 'fixed', title: b.title, start_time: b.startTime, end_time: b.endTime });
    });

    const hours = parseFloat(studyHours);
    if (!isNaN(hours) && hours > 0) {
      toInsert.push({ user_id: user.id, type: 'flexible', title: 'FOCUS BLOCK', duration_minutes: hours * 60, min_chunk_minutes: 60, priority: 10 });
    }

    filteredFitness.forEach(f => {
      toInsert.push({ user_id: user.id, type: 'flexible', title: f, duration_minutes: 60, min_chunk_minutes: 60, priority: 5 });
    });

    filteredGoals.forEach(g => {
       toInsert.push({ user_id: user.id, type: 'flexible', title: `[LONG-TERM] ${g}`, duration_minutes: 0, min_chunk_minutes: 0, priority: -1 });
    });

    const { error: delErr } = await supabase.from('routines').delete().eq('user_id', user.id);
    if (delErr) alert("⚠️ 删除旧纪律被拒绝！很可能由于 RLS 拦截。\n错误: " + delErr.message);

    if (toInsert.length > 0) {
      const { error: insErr } = await supabase.from('routines').insert(toInsert);
      if (insErr) alert("❌ 写入计划失败！Supabase RLS 被锁住。\n错误: " + insErr.message);
    }
    
    // 生成配置后，清除今日 Custom Schedule 使其根据新配方生成
    const todayStr = getBeijingDateStr();
    await supabase.from('daily_logs').update({ custom_schedule: null }).eq('user_id', user.id).eq('log_date', todayStr);
    
    await initDashboard();
  };

  const handleAddHardBlock = () => setHardBlocks([...hardBlocks, { id: Date.now().toString(), title: '', startTime: '08:00', endTime: '10:00' }]);
  const handleUpdateHardBlock = (id: string, field: keyof FixedRoutine, value: string) => setHardBlocks(hardBlocks.map(b => b.id === id ? { ...b, [field]: value } : b));
  const handleRemoveHardBlock = (id: string) => setHardBlocks(hardBlocks.filter(b => b.id !== id));

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.refresh(); 
  };

  const totalCompletedCount = todayRoutines.filter(r => r.completed).length;
  const percentage = todayRoutines.length === 0 ? 0 : Math.round((totalCompletedCount / todayRoutines.length) * 100);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed] font-sans selection:bg-neutral-800 p-8">
      {/* 顶部 Header */}
      <header className="max-w-5xl mx-auto flex justify-between items-center pb-8 border-b border-neutral-900">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tighter flex items-center gap-2">
            <Target className="w-6 h-6 text-neutral-400" />
            西格玛自律引擎
          </h1>
          {longTermGoals.filter(g => g.trim() !== "").length > 0 && (
            <div className="flex flex-col gap-1 mt-2">
              {longTermGoals.filter(g => g.trim() !== "").map((goal, index) => (
                <span key={index} className="text-xs font-mono text-neutral-500 uppercase flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                  DIRECTIVE: {goal}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-4 items-center">
          <div className="flex items-center gap-2 px-3 py-1 bg-amber-900/20 rounded-full border border-amber-800/50">
            <Crown className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-medium text-amber-500 tracking-wider text-xs">{SEASON_CONFIG.name}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-neutral-900/50 rounded-full border border-neutral-800">
            <Flame className="w-4 h-4 text-orange-500" />
            <span className="text-sm font-medium">{streak} 连胜</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-emerald-950/30 rounded-full border border-emerald-900/50">
            <span className="text-sm font-medium tracking-wide font-mono text-emerald-500">Σ {sigmaPoints} 赛季积分</span>
          </div>
          <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 px-3 py-1 bg-neutral-900/50 hover:bg-neutral-800 rounded-full border border-neutral-800 transition-colors text-white">
            <Settings2 className="w-4 h-4" />
          </button>
          <button onClick={handleLogout} className="flex items-center gap-2 px-3 py-1 bg-neutral-900/50 hover:bg-neutral-800 rounded-full border border-neutral-800 transition-colors text-neutral-400 hover:text-white">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 主面板 Grid */}
      <main className="max-w-5xl mx-auto mt-12 grid grid-cols-1 lg:grid-cols-12 gap-10">
        
        {/* 左侧：今日核心打卡清单 */}
        <section className="col-span-1 lg:col-span-7 space-y-6">
          <div className="flex justify-between items-center">
             <h2 className="text-sm font-semibold tracking-widest text-neutral-500">今日纪律清单 <span className="ml-2 text-xs font-mono bg-neutral-900 text-neutral-400 px-2 py-0.5 rounded opacity-75">{getBeijingDateStr()}</span></h2>
             {loading && <span className="text-xs text-neutral-600 font-mono animate-pulse">SYNCING DATABANKS...</span>}
          </div>
          
          {todayRoutines.length > 0 && !loading && (
            <div className="mb-6 bg-[#111111] p-6 rounded-2xl border border-neutral-800">
              <div className="flex justify-between items-end mb-4">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-neutral-500 tracking-widest uppercase mb-1">Protocol Integrity</span>
                  <span className="text-3xl font-mono font-black text-white leading-none">{percentage}%</span>
                </div>
                <div className="flex flex-col text-right">
                  <span className="text-xs font-bold text-neutral-500 tracking-widest uppercase mb-1">Earned Today</span>
                  <span className="text-3xl font-mono font-black text-emerald-500 leading-none">+ {earnedToday} <span className="text-lg">Σ</span></span>
                </div>
              </div>
              
              <div className="relative w-full h-3 bg-neutral-900 rounded-full overflow-hidden mb-2">
                <div className={`absolute top-0 left-0 h-full transition-all duration-700 ease-out ${percentage >= 100 ? 'bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.6)]' : 'bg-emerald-500'}`} style={{ width: `${percentage}%` }}></div>
                {[25, 50, 75].map(pt => (
                  <div key={pt} className="absolute top-0 h-full w-[3px] bg-black z-10" style={{ left: `${pt}%` }}></div>
                ))}
              </div>
              
              <div className="flex justify-between text-[11px] font-mono font-bold text-neutral-600 tracking-wider">
                <span className={percentage >= 25 ? "text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]" : ""}>25% = 25Σ</span>
                <span className={percentage >= 50 ? "text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]" : ""}>50% = 50Σ</span>
                <span className={percentage >= 75 ? "text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]" : ""}>75% = 75Σ</span>
                <span className={percentage >= 100 ? "text-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]" : ""}>100% = 100Σ</span>
              </div>
            </div>
          )}
          
          <div className="space-y-3">
            {!loading && todayRoutines.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 px-4 border border-neutral-800 border-dashed rounded-2xl bg-[#0f0f0f]">
                <Target className="w-12 h-12 text-neutral-700 mb-6" />
                <h3 className="text-neutral-500 font-mono tracking-widest text-sm mb-8 uppercase text-center">SYSTEM IDLE. AWAITING YOUR PROTOCOL.</h3>
                <button 
                  onClick={() => setIsModalOpen(true)}
                  className="flex items-center gap-2 px-8 py-3 bg-white text-black text-sm font-bold tracking-wide rounded-full hover:bg-neutral-200 transition-transform active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  配置纪律并生成清单 (Config & Generate)
                </button>
              </div>
            ) : (
              <>
                {todayRoutines.map((task) => (
                  <div 
                    key={task.id}
                    className={`group flex flex-col md:flex-row md:items-center justify-between p-4 rounded-xl border transition-all ${
                      task.completed 
                        ? 'border-emerald-900/40 bg-emerald-950/10 opacity-75' 
                        : 'border-neutral-800 hover:border-neutral-700 bg-[#0f0f0f]'
                    }`}
                  >
                    <div className="flex items-center gap-4 cursor-pointer flex-1" onClick={() => toggleTask(task.id, !!task.completed)}>
                      <button className={`transition-colors flex-shrink-0 ${task.completed ? 'text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'text-neutral-600 hover:text-white'}`}>
                        {task.completed ? <CheckCircle2 className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
                      </button>
                      
                      {/* 任务名称可直接编辑 */}
                      <input 
                         type="text" 
                         value={task.title}
                         onChange={(e) => {
                           const updated = todayRoutines.map(b => b.id === task.id ? { ...b, title: e.target.value } : b);
                           setTodayRoutines(updated);
                           supabase.from('daily_logs').update({ custom_schedule: JSON.stringify(updated) }).eq('user_id', user.id).eq('log_date', getBeijingDateStr());
                         }}
                         onClick={(e) => e.stopPropagation()}
                         className={`bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-neutral-700 rounded px-1 -ml-1 w-full max-w-[200px] font-medium tracking-wide ${task.completed ? 'line-through decoration-emerald-900/50 text-emerald-100/70' : 'text-white'}`}
                      />
                    </div>

                    {/* 动态时间调节器与删除器 */}
                    <div className="flex items-center gap-2 mt-3 md:mt-0 pl-10 md:pl-0 opacity-100 transition-opacity">
                      <div className="flex items-center gap-1 bg-neutral-900/50 border border-neutral-800 rounded-md px-2 py-1" onClick={(e) => e.stopPropagation()}>
                        <Clock className="w-3 h-3 text-neutral-500 hidden sm:block" />
                        <input 
                          type="time" 
                          value={task.startTimeString || "00:00"}
                          onChange={(e) => handleTimeChange(task.id, 'startTimeString', e.target.value)}
                          className="bg-transparent text-xs font-mono font-bold text-neutral-400 focus:text-white focus:outline-none [color-scheme:dark] w-[70px]"
                        />
                        <span className="text-neutral-600 text-xs">-</span>
                        <input 
                          type="time" 
                          value={task.endTimeString || "00:00"}
                          onChange={(e) => handleTimeChange(task.id, 'endTimeString', e.target.value)}
                          className="bg-transparent text-xs font-mono font-bold text-neutral-400 focus:text-white focus:outline-none [color-scheme:dark] w-[70px]"
                        />
                      </div>
                      
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDeleteBlock(task.id); }}
                        className="p-1.5 text-neutral-600 hover:bg-red-950/50 hover:text-red-500 rounded-md transition-colors"
                        title="删除该时间块"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                
                {/* 增加新的自定义行按钮 */}
                <button 
                  onClick={handleCreateCustomBlock}
                  className="w-full flex justify-center items-center gap-2 py-4 mt-2 border border-dashed border-neutral-800 rounded-xl text-neutral-600 hover:text-white hover:border-neutral-600 transition-colors text-xs font-bold tracking-widest uppercase"
                >
                  <Plus className="w-4 h-4" /> 自定义注入新纪律 (Add Custom Protocol)
                </button>
              </>
            )}
          </div>
        </section>

        {/* 右侧：全球西格玛排行榜 */}
        <section className="col-span-1 lg:col-span-5">
          <div className="sticky top-10 flex flex-col p-8 rounded-2xl border border-neutral-800 bg-[#111111] overflow-hidden relative">
            <div className="flex justify-between items-center mb-2 z-10">
              <h3 className="text-sm font-bold tracking-widest text-[#ededed] flex items-center gap-2">
                <Trophy className="w-4 h-4 text-emerald-500" />
                {SEASON_CONFIG.name} (TOP 5)
              </h3>
              <div className="flex items-center gap-2 px-2 py-0.5 border border-red-900/50 bg-red-950/30 rounded text-[10px] font-mono font-bold text-red-500 tracking-widest uppercase shadow-[0_0_10px_rgba(239,68,68,0.2)]">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>
                LIVE RADAR
              </div>
            </div>
            <p className="text-xs text-neutral-500 font-mono mb-8 z-10">GLOBAL RANKING - POINTS CLEAR ON 2026-06-18</p>
            
            <div className="space-y-2 z-10">
              {leaderboard.length === 0 && !loading && (
                 <div className="text-neutral-600 font-mono text-center text-xs py-8 border border-neutral-800 border-dashed rounded-lg">AWAITING LEADERBOARD DATA</div>
              )}
              {leaderboard.map((u, idx) => {
                const isMe = u.user_id === user.id;
                return (
                  <div key={u.user_id || idx} className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${isMe ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-[#0a0a0a] border-neutral-800'}`}>
                    <div className="flex items-center gap-3">
                      <span className={`font-mono text-xs font-bold w-4 text-center ${idx === 0 ? 'text-yellow-500' : idx === 1 ? 'text-neutral-300' : idx === 2 ? 'text-orange-400' : 'text-neutral-600'}`}>
                        {idx + 1}
                      </span>
                      <span className={`text-sm tracking-wide font-medium ${isMe ? 'text-emerald-400 font-bold' : 'text-neutral-300'}`}>
                         {u.username.substring(0, 12)}
                         {isMe && " (YOU)"}
                      </span>
                    </div>
                    <span className="font-mono text-xs font-bold text-white bg-neutral-900 px-2 py-1 rounded">
                      Σ {u.points}
                    </span>
                  </div>
                );
              })}
            </div>
            
            {/* 深色渐变底纹 */}
            <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-emerald-500 rounded-full blur-[120px] opacity-[0.03] pointer-events-none" />
          </div>
        </section>
      </main>

      {/* 弹窗配置表单 - Modal (Trunacted heavily since we only show logic changes, but I am replacing the full file so I include it) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#111111] border border-neutral-800 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto overflow-x-hidden shadow-2xl relative">
            <div className="sticky top-0 bg-[#111111] border-b border-neutral-800 p-6 flex items-center justify-between z-10">
              <h2 className="text-xl font-bold tracking-tighter flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-neutral-400" />
                系统配置 (SYSTEM CONFIGURATION)
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-neutral-500 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-8 space-y-8">
              {/* 长期总目标 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-widest text-neutral-500">长期总目标 (Long-term Goals)</label>
                  <button onClick={() => setLongTermGoals([...longTermGoals, ""])} className="text-xs flex items-center gap-1 text-neutral-400 hover:text-white transition-colors">
                    <Plus className="w-3 h-3" /> 添加目标 (Add Another Goal)
                  </button>
                </div>
                <div className="space-y-3">
                  {longTermGoals.length === 0 && <div className="text-xs text-neutral-600 font-mono italic border border-neutral-800 border-dashed rounded-lg p-4 text-center">NO GOALS DEFINED</div>}
                  {longTermGoals.map((goal, index) => (
                    <div key={index} className="flex gap-2 items-center">
                      <input type="text" value={goal} onChange={(e) => { const newGoals = [...longTermGoals]; newGoals[index] = e.target.value; setLongTermGoals(newGoals); }} placeholder="DEFINE YOUR ULTIMATE OBJECTIVE" className="flex-1 bg-[#0a0a0a] border border-neutral-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-neutral-500 transition-colors placeholder-neutral-700 text-white" />
                      <button onClick={() => setLongTermGoals(longTermGoals.filter((_, i) => i !== index))} className="p-3 hover:bg-neutral-800 rounded-lg text-neutral-500 hover:text-red-400 transition-colors border border-neutral-800 bg-[#0a0a0a]"><X className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 每日总学习时长目标 */}
              <div className="space-y-3">
                <label className="text-xs font-semibold uppercase tracking-widest text-neutral-500">每日总学习时长/Focus目标 (Total Daily Focus)</label>
                <input type="number" min="0" step="0.5" value={studyHours} onChange={(e) => setStudyHours(e.target.value)} placeholder="设置基准参考时长 E.G., 8" className="w-full bg-[#0a0a0a] border border-neutral-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-neutral-500 transition-colors placeholder-neutral-700 text-white font-mono" />
                <p className="text-[10px] text-neutral-600">注：生成后可直接在首页列表自由伸缩、添加、修改具体的每个 Focus Block 时间，进度条会实时适配。</p>
              </div>

              {/* 健身/训练目标 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-widest text-neutral-500">健身/训练目标 (Training Goals)</label>
                  <button onClick={() => setFitnessGoals([...fitnessGoals, ""])} className="text-xs flex items-center gap-1 text-neutral-400 hover:text-white transition-colors">
                    <Plus className="w-3 h-3" /> 添加目标 (Add Another Goal)
                  </button>
                </div>
                <div className="space-y-3">
                  {fitnessGoals.length === 0 && <div className="text-xs text-neutral-600 font-mono italic border border-neutral-800 border-dashed rounded-lg p-4 text-center">NO TRAINING GOALS DEFINED</div>}
                  {fitnessGoals.map((goal, index) => (
                    <div key={index} className="flex gap-2 items-center">
                      <input type="text" value={goal} onChange={(e) => { const newGoals = [...fitnessGoals]; newGoals[index] = e.target.value; setFitnessGoals(newGoals); }} placeholder="YOUR FITNESS DIRECTIVE" className="flex-1 bg-[#0a0a0a] border border-neutral-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-neutral-500 transition-colors placeholder-neutral-700 text-white" />
                      <button onClick={() => setFitnessGoals(fitnessGoals.filter((_, i) => i !== index))} className="p-3 hover:bg-neutral-800 rounded-lg text-neutral-500 hover:text-red-400 transition-colors border border-neutral-800 bg-[#0a0a0a]"><X className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 学校课程表/硬性时间块 */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-widest text-neutral-500">学校课程表/硬性时间块 (Hard Blocks)</label>
                  <button onClick={handleAddHardBlock} className="text-xs flex items-center gap-1 text-neutral-400 hover:text-white transition-colors">
                    <Plus className="w-3 h-3" /> 添加占用时段
                  </button>
                </div>
                {hardBlocks.length === 0 && <div className="text-xs text-neutral-600 font-mono italic border border-neutral-800 border-dashed rounded-lg p-4 text-center">NO HARD BLOCKS DEFINED</div>}
                <div className="space-y-3">
                  {hardBlocks.map((block) => (
                    <div key={block.id} className="flex gap-2 items-center bg-[#0a0a0a] p-2 rounded-lg border border-neutral-800">
                      <input type="text" placeholder="BLOCK NAME" value={block.title} onChange={(e) => handleUpdateHardBlock(block.id, 'title', e.target.value)} className="flex-1 bg-transparent border-none text-sm focus:outline-none px-2 text-white placeholder-neutral-700" />
                      <input type="time" value={block.startTime} onChange={(e) => handleUpdateHardBlock(block.id, 'startTime', e.target.value)} className="w-24 bg-transparent border-none text-sm focus:outline-none font-mono text-neutral-400 [color-scheme:dark]" />
                      <span className="text-neutral-600">-</span>
                      <input type="time" value={block.endTime} onChange={(e) => handleUpdateHardBlock(block.id, 'endTime', e.target.value)} className="w-24 bg-transparent border-none text-sm focus:outline-none font-mono text-neutral-400 [color-scheme:dark]" />
                      <button onClick={() => handleRemoveHardBlock(block.id)} className="p-2 hover:bg-neutral-800 rounded text-neutral-500 hover:text-red-400 transition-colors"><X className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              </div>
              {/* 提交按钮 */}
              <div className="pt-6">
                <button 
                  onClick={generateRoutineConfig}
                  className="w-full flex justify-center items-center gap-2 py-4 bg-white text-black text-sm font-bold uppercase tracking-widest rounded-xl hover:bg-neutral-200 transition-all active:scale-[0.98]"
                >
                  <Flame className="w-5 h-5" />
                  保存基础模板并重置今日安排 (RE-GENERATE)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
