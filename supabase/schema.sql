-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. 用户核心表 (扩展 Supabase Auth.users 表)
CREATE TABLE public.users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  sigma_points_total INT DEFAULT 0,     -- 西格玛总积分
  current_streak INT DEFAULT 0,         -- 当前连胜天数
  longest_streak INT DEFAULT 0,         -- 历史最长连胜
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 惯例集表 (固定课表/硬核日程/弹性目标)
CREATE TYPE routine_type AS ENUM ('fixed', 'flexible');

CREATE TABLE public.routines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  type routine_type NOT NULL,
  title TEXT NOT NULL,
  start_time TIME,                      -- [仅 Fixed 项] 开始时间，如 '07:30' (八部金刚功)
  end_time TIME,                        -- [仅 Fixed 项] 结束时间
  days_of_week INT[],                   -- 执行日，如 [1,2,3,4,5] 代表周一至周五
  duration_minutes INT,                 -- [仅 Flexible 项] 所需总时长（分钟）
  min_chunk_minutes INT DEFAULT 60,     -- [仅 Flexible 项] 最小可切分时间块 (例如 50m专注+10m休息 = 60m)
  priority INT DEFAULT 0,               -- [仅 Flexible 项] 排程优先级 (更高优先安排)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 每日打卡与热力表 (追踪记录)
CREATE TABLE public.daily_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  completed_routines JSONB DEFAULT '[]',-- 记录完成的 routine ids，用于快速查询和打卡复现
  sigma_points_earned INT DEFAULT 0,    -- 当日获利西格玛积分
  focus_minutes_total INT DEFAULT 0,    -- 当日总专注时长（提供给GitHub风格热力图使用）
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, log_date)             -- 保证单用户每日一档记录
);

-- 4. 积分排行榜 (周/月维度统计)
CREATE TYPE leaderboard_period AS ENUM ('weekly', 'monthly');

CREATE TABLE public.leaderboard (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  period_type leaderboard_period NOT NULL,
  period_start DATE NOT NULL,           -- 该周期的起始日期 (如周一的日期，或每月1号)
  points INT DEFAULT 0, 
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, period_type, period_start)
);

-- 为避免越权，强烈建议后续开启 RLS (Row Level Security)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_logs ENABLE ROW LEVEL SECURITY;
