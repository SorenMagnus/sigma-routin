// 类型定义
export interface FixedRoutine {
  id: string;
  title: string;
  startTime: string; // 格式: "HH:mm"
  endTime: string;   // 格式: "HH:mm"
}

export interface FlexibleGoal {
  id: string;
  title: string;
  totalDurationMinutes: number; // 比如下午力量训练90m，或每日学习450m (7.5h)
  minChunkMinutes: number;      // 比如 60 (50m 专注 + 10m 休息)
  priority: number;             // 数值越大越优先插入
}

export interface ScheduleBlock {
  id: string;
  title: string;
  startMin: number;             // 距离 00:00 的分钟数
  endMin: number;
  startTimeString: string;
  endTimeString: string;
  type: 'fixed' | 'flexible_chunk';
}

// 辅助方法：时间格式转分钟
const timeToMin = (timeStr: string) => {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
};

// 辅助方法：分钟转时间格式
const minToTime = (min: number) => {
  const h = Math.floor(min / 60).toString().padStart(2, '0');
  const m = (min % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
};

/**
 * 核心：西格玛智能排位算法
 * 机制：提取所有固定日程形成的 Free Slots，再按优先级和切块要求填入灵活目标。
 */
export function generateSigmaSchedule(
  fixed: FixedRoutine[],
  flexible: FlexibleGoal[],
  dayStart: string = "06:00", // 默认 6:00 起床开启纪律
  dayEnd: string = "23:00"    // 默认 23:00 结束日志
): ScheduleBlock[] {
  let schedule: ScheduleBlock[] = [];
  
  // 1. 转换并排序 Fixed Routines
  const fixedBlocks: ScheduleBlock[] = fixed.map(f => ({
    id: f.id,
    title: f.title,
    startMin: timeToMin(f.startTime),
    endMin: timeToMin(f.endTime),
    startTimeString: f.startTime,
    endTimeString: f.endTime,
    type: 'fixed' as const,
  })).sort((a, b) => a.startMin - b.startMin);
  
  schedule.push(...fixedBlocks);

  // 2. 提取空闲时间窗 (Free Slots)
  interface FreeSlot { start: number; end: number; capacity: number; }
  let freeSlots: FreeSlot[] = [];
  let currentMin = timeToMin(dayStart);
  let endOfDay = timeToMin(dayEnd);

  for (const block of fixedBlocks) {
    if (block.startMin > currentMin) {
      freeSlots.push({ start: currentMin, end: block.startMin, capacity: block.startMin - currentMin });
    }
    currentMin = Math.max(currentMin, block.endMin);
  }
  if (currentMin < endOfDay) {
    freeSlots.push({ start: currentMin, end: endOfDay, capacity: endOfDay - currentMin });
  }

  // 3. 排序 Flexible Goals (先排优先级高，再排时间需求大的)
  const sortedFlexible = [...flexible].sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return b.totalDurationMinutes - a.totalDurationMinutes;
  });

  // 4. 将 Flexible Goals 填入 Free Slots (贪心算法 + 时间切块)
  for (const goal of sortedFlexible) {
    let remainingMinutes = goal.totalDurationMinutes;
    const chunkMin = goal.minChunkMinutes;

    for (let slot of freeSlots) {
      if (remainingMinutes <= 0) break;

      // 只要空闲槽还能塞进一个最小颗粒度的区块（或剩余的全部时间不够一个chunk但槽够大）
      while (slot.capacity >= chunkMin && remainingMinutes >= chunkMin) {
        const blockStart = slot.start;
        const blockEnd = slot.start + chunkMin;
        
        schedule.push({
          id: `${goal.id}-chunk-${blockStart}`,
          title: goal.title, // e.g., "专注学习 (50+10循环)"
          startMin: blockStart,
          endMin: blockEnd,
          startTimeString: minToTime(blockStart),
          endTimeString: minToTime(blockEnd),
          type: 'flexible_chunk',
        });

        // 扣减时间
        remainingMinutes -= chunkMin;
        slot.start += chunkMin;
        slot.capacity -= chunkMin;
      }
    }
  }

  // 5. 将整个混合时间表按时间顺序排序并返回
  return schedule.sort((a, b) => a.startMin - b.startMin);
}
