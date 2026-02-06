import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X, Send, Bot, User, Sparkles, Loader2, Zap } from 'lucide-react';
import { ChatMessage, BoardState, Task, Priority, ColumnId } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { isOverdue } from '../utils/export';

// ==================== TYPES ====================

interface ChatbotProps {
  board: BoardState;
  onAddTask: (columnId: ColumnId, title: string, description: string, priority: Priority, dueDate: string | null, tags: string[]) => string;
  onUpdateTask: (taskId: string, updates: Partial<Omit<Task, 'id' | 'createdAt'>>) => void;
  onDeleteTask: (taskId: string) => void;
  onMoveTask: (taskId: string, sourceCol: ColumnId, destCol: ColumnId, destIndex: number) => void;
}

type ChatBotAction =
  | { type: 'create'; columnId: ColumnId; title: string; description: string; priority: Priority; dueDate: string | null; tags: string[] }
  | { type: 'update'; taskId: string; updates: Partial<Omit<Task, 'id' | 'createdAt'>> }
  | { type: 'delete'; taskId: string }
  | { type: 'move'; taskId: string; sourceCol: ColumnId; destCol: ColumnId };

interface ChatResponse {
  text: string;
  action?: ChatBotAction;
}

// ==================== CONSTANTS ====================

const COLUMN_NAMES: Record<ColumnId, string> = {
  'todo': 'To Do',
  'in-progress': 'In Progress',
  'done': 'Done',
};

const PRIORITY_EMOJI: Record<Priority, string> = { high: '🔴', medium: '🟡', low: '🟢' };

// ==================== HELPERS ====================

function findTaskInMessage(message: string, board: BoardState): { task: Task | null; candidates: Task[] } {
  const allTasks = Object.values(board.tasks);
  if (allTasks.length === 0) return { task: null, candidates: [] };
  const lower = message.toLowerCase();

  // First check for quoted task names
  const quoted = message.match(/["']([^"']+)["']/);
  if (quoted) {
    const q = quoted[1].toLowerCase();
    const exact = allTasks.find(t => t.title.toLowerCase() === q);
    if (exact) return { task: exact, candidates: [] };
    const partial = allTasks.filter(t => t.title.toLowerCase().includes(q) || q.includes(t.title.toLowerCase()));
    if (partial.length === 1) return { task: partial[0], candidates: [] };
    if (partial.length > 1) return { task: null, candidates: partial.slice(0, 5) };
  }

  // Strategy 1: Exact substring match (longest title first for specificity)
  const sortedByLength = [...allTasks].sort((a, b) => b.title.length - a.title.length);
  for (const task of sortedByLength) {
    const titleLower = task.title.toLowerCase();
    if (titleLower.length >= 3 && lower.includes(titleLower)) {
      return { task, candidates: [] };
    }
  }

  // Strategy 2: Word overlap scoring
  // Remove common command words to isolate the task reference
  const stopWords = new Set(['create', 'add', 'make', 'new', 'task', 'move', 'delete', 'remove',
    'change', 'set', 'update', 'edit', 'modify', 'rename', 'complete', 'finish', 'start', 'begin',
    'the', 'a', 'an', 'to', 'from', 'of', 'for', 'with', 'in', 'on', 'at', 'by',
    'priority', 'high', 'medium', 'low', 'due', 'date', 'tag', 'tags', 'title', 'name',
    'description', 'desc', 'details', 'column', 'status', 'todo', 'progress', 'done',
    'please', 'can', 'you', 'could', 'would', 'want', 'need', 'like', 'it', 'its',
    'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'my', 'this', 'that']);

  const messageWords = lower.split(/\s+/).filter(w => w.length > 1 && !stopWords.has(w));

  const scored = allTasks.map(task => {
    const titleWords = task.title.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    let matchCount = 0;
    for (const tw of titleWords) {
      for (const mw of messageWords) {
        if (tw === mw || tw.includes(mw) || mw.includes(tw)) {
          matchCount++;
          break;
        }
      }
    }
    const score = titleWords.length > 0 ? matchCount / titleWords.length : 0;
    return { task, score, matchCount };
  }).filter(s => s.score > 0.3 || s.matchCount >= 2).sort((a, b) => b.score - a.score || b.matchCount - a.matchCount);

  if (scored.length === 0) return { task: null, candidates: [] };
  if (scored.length === 1) return { task: scored[0].task, candidates: [] };
  if (scored[0].score >= 0.6 && scored[0].score > scored[1].score * 1.2) {
    return { task: scored[0].task, candidates: [] };
  }
  return { task: null, candidates: scored.slice(0, 5).map(s => s.task) };
}

function parseNaturalDate(text: string): string | null {
  const lower = text.toLowerCase().trim();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (lower === 'today' || lower === 'end of day' || lower === 'eod') {
    return today.toISOString().slice(0, 10);
  }
  if (lower === 'tomorrow' || lower === 'tmr' || lower === 'tmrw') {
    const d = new Date(today); d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  if (lower === 'next week') {
    const d = new Date(today); d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  }
  if (lower === 'next month') {
    const d = new Date(today); d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  }

  // "in X days/weeks"
  const inDays = lower.match(/in\s+(\d+)\s+day/);
  if (inDays) {
    const d = new Date(today); d.setDate(d.getDate() + parseInt(inDays[1]));
    return d.toISOString().slice(0, 10);
  }
  const inWeeks = lower.match(/in\s+(\d+)\s+week/);
  if (inWeeks) {
    const d = new Date(today); d.setDate(d.getDate() + parseInt(inWeeks[1]) * 7);
    return d.toISOString().slice(0, 10);
  }

  // "next monday/tuesday/..."
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const nextDayMatch = lower.match(/(next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
  if (nextDayMatch) {
    const targetDay = dayNames.indexOf(nextDayMatch[2]);
    const d = new Date(today);
    const currentDay = d.getDay();
    let daysUntil = targetDay - currentDay;
    if (daysUntil <= 0) daysUntil += 7;
    d.setDate(d.getDate() + daysUntil);
    return d.toISOString().slice(0, 10);
  }

  // Direct date parsing (YYYY-MM-DD, MM/DD/YYYY, etc.)
  const dateAttempt = new Date(lower);
  if (!isNaN(dateAttempt.getTime()) && dateAttempt.getFullYear() > 2000) {
    return dateAttempt.toISOString().slice(0, 10);
  }

  return null;
}

function parseColumnRef(text: string): ColumnId | null {
  const lower = text.toLowerCase();
  if (lower.match(/\b(to[\s-]?do|todo|backlog)\b/)) return 'todo';
  if (lower.match(/\b(in[\s-]?progress|doing|working|active|started|wip)\b/)) return 'in-progress';
  if (lower.match(/\b(done|completed?|finished?)\b/)) return 'done';
  return null;
}

function parsePriorityRef(text: string): Priority | null {
  const lower = text.toLowerCase();
  if (lower.match(/\b(high|urgent|critical|important)\b/)) return 'high';
  if (lower.match(/\b(medium|normal|moderate|med)\b/)) return 'medium';
  if (lower.match(/\b(low|minor|trivial)\b/)) return 'low';
  return null;
}

function normalizeMessage(msg: string): string {
  return msg
    .replace(/^(please\s+|can\s+you\s+|could\s+you\s+|would\s+you\s+|i\s+want\s+to\s+|i'd\s+like\s+to\s+|i\s+need\s+to\s+|i\s+want\s+you\s+to\s+)/i, '')
    .replace(/\?+$/, '')
    .trim();
}

function formatCandidates(candidates: Task[]): string {
  return candidates.map(c => `• **${c.title}** (${COLUMN_NAMES[c.columnId]}, ${c.priority} priority)`).join('\n');
}

// ==================== MAIN NLP PROCESSOR ====================

function processMessage(message: string, board: BoardState): ChatResponse {
  const normalized = normalizeMessage(message);
  const lower = normalized.toLowerCase();
  const allTasks = Object.values(board.tasks);
  const todoTasks = allTasks.filter(t => t.columnId === 'todo');
  const inProgressTasks = allTasks.filter(t => t.columnId === 'in-progress');
  const doneTasks = allTasks.filter(t => t.columnId === 'done');
  const overdueTasks = allTasks.filter(t => t.columnId !== 'done' && isOverdue(t.dueDate));
  const highPriorityTasks = allTasks.filter(t => t.priority === 'high' && t.columnId !== 'done');

  // ========= ADD TAGS TO TASK =========
  if (lower.match(/^add\s+(a\s+)?tags?\b/) || lower.match(/^tag\s/)) {
    const tagSourceMatch = normalized.match(/(?:add\s+(?:a\s+)?tags?\s+|tag\s+)(.+?)(?:\s+to\s+|\s+on\s+|\s+for\s+)(.+)/i);
    if (tagSourceMatch) {
      const newTags = tagSourceMatch[1].split(/[,;&]+/).map(t => t.trim().toLowerCase()).filter(Boolean);
      const taskRef = tagSourceMatch[2];
      const { task, candidates } = findTaskInMessage(taskRef, board);
      if (!task && candidates.length > 0) {
        return { text: `Which task do you mean?\n\n${formatCandidates(candidates)}` };
      }
      if (!task) {
        return { text: `❌ I couldn't find a task matching "**${taskRef}**". Please check the name and try again.` };
      }
      const merged = [...new Set([...task.tags, ...newTags])];
      return {
        text: `🏷️ Added tag${newTags.length > 1 ? 's' : ''} **${newTags.join(', ')}** to **${task.title}**.\n\nCurrent tags: ${merged.map(t => `\`${t}\``).join(', ')}`,
        action: { type: 'update', taskId: task.id, updates: { tags: merged } },
      };
    }
    return { text: `To add tags, say:\n• **"Add tag frontend to [task name]"**\n• **"Add tags design, ui to [task name]"**` };
  }

  // ========= REMOVE TAGS FROM TASK =========
  if (lower.match(/^remove\s+(a\s+)?tags?\b/) || lower.match(/^untag\s/)) {
    const tagMatch = normalized.match(/(?:remove\s+(?:a\s+)?tags?\s+|untag\s+)(.+?)(?:\s+from\s+|\s+on\s+)(.+)/i);
    if (tagMatch) {
      const tagsToRemove = tagMatch[1].split(/[,;&]+/).map(t => t.trim().toLowerCase()).filter(Boolean);
      const taskRef = tagMatch[2];
      const { task, candidates } = findTaskInMessage(taskRef, board);
      if (!task && candidates.length > 0) {
        return { text: `Which task do you mean?\n\n${formatCandidates(candidates)}` };
      }
      if (!task) {
        return { text: `❌ I couldn't find a task matching "**${taskRef}**". Please check the name and try again.` };
      }
      const remaining = task.tags.filter(t => !tagsToRemove.includes(t));
      return {
        text: `🏷️ Removed tag${tagsToRemove.length > 1 ? 's' : ''} **${tagsToRemove.join(', ')}** from **${task.title}**.${remaining.length > 0 ? `\n\nRemaining tags: ${remaining.map(t => `\`${t}\``).join(', ')}` : '\n\nNo tags remaining.'}`,
        action: { type: 'update', taskId: task.id, updates: { tags: remaining } },
      };
    }
    return { text: `To remove tags, say:\n• **"Remove tag frontend from [task name]"**\n• **"Remove tags design, ui from [task name]"**` };
  }

  // ========= CREATE TASK =========
  if (lower.match(/^(create|add|make|new)\s/) || lower.match(/^(create|add)\s*$/) || lower === 'new task') {
    // But NOT if it's a question
    if (lower.match(/^(how|what|when|where|why|can i)\s/)) {
      // Fall through to Q&A
    } else {
      let title = '';
      let description = '';

      // Extract title from quotes
      const quotedTitle = normalized.match(/["']([^"']+)["']/);
      if (quotedTitle) {
        title = quotedTitle[1];
      }

      // Extract title from "called/titled/named" pattern
      if (!title) {
        const calledMatch = normalized.match(/(?:called|titled|named)\s+(.+?)(?:\s+(?:with|priority|due|by|tags?|tagged|in\s+(?:todo|to\s?do|in\s?progress|doing|done)|description|desc)\b|$)/i);
        if (calledMatch) title = calledMatch[1].trim();
      }

      // Extract title after colon
      if (!title) {
        const colonMatch = normalized.match(/(?:task|item|card)\s*:\s*(.+?)(?:\s+(?:with|priority|due|by|tags?|tagged|in\s+(?:todo|to\s?do|in\s?progress|doing|done)|description|desc)\b|$)/i);
        if (colonMatch) title = colonMatch[1].trim();
      }

      // Extract title from "task [title]" pattern
      if (!title) {
        const taskMatch = normalized.match(/(?:task|item|card)\s+(.+?)(?:\s+(?:with|priority|due|by|tags?|tagged|in\s+(?:todo|to\s?do|in[\s-]?progress|doing|done|completed)|description|desc)\b|$)/i);
        if (taskMatch) {
          title = taskMatch[1].replace(/^(a|an|the)\s+/i, '').replace(/^(called|titled|named)\s+/i, '').trim();
        }
      }

      // Try "add/create [title]" without "task" keyword — only if something follows
      if (!title) {
        const directMatch = normalized.match(/^(?:create|add|make|new)\s+(?:a\s+|an\s+)?(?:(?:high|medium|low)[\s-]?(?:priority\s+)?)?(.+?)(?:\s+(?:with|priority|due|by|tags?|tagged|in\s+(?:todo|to\s?do|in[\s-]?progress|doing|done)|description|desc)\b|$)/i);
        if (directMatch) {
          let candidate = directMatch[1].replace(/^(task|item|card)\s*/i, '').replace(/^(called|titled|named)\s+/i, '').trim();
          // Don't use if it's just "a task" or empty
          if (candidate && candidate.toLowerCase() !== 'task' && candidate.toLowerCase() !== 'a' && candidate.length > 1) {
            title = candidate;
          }
        }
      }

      if (!title) {
        return {
          text: `I'd be happy to create a task! Please provide a title. Here are some examples:\n\n• **"Create task: Fix the login bug"**\n• **"Add a task called Review PR"**\n• **"Create a high priority task 'Deploy v2' due tomorrow"**\n• **"New task Design homepage with tags design, ui"**\n• **"Add task Set up CI/CD in progress"**`,
        };
      }

      // Parse optional fields from the full message
      const priority = parsePriorityRef(lower) || 'medium';
      const column = parseColumnRef(lower) || 'todo';

      // Parse due date
      let dueDate: string | null = null;
      const dueDateMatch = lower.match(/(?:due|by|deadline)\s+(.+?)(?:\s+(?:with|priority|tags?|tagged|in\s+(?:todo|to\s?do|in[\s-]?progress|doing|done)|description|desc)\b|$)/i);
      if (dueDateMatch) {
        dueDate = parseNaturalDate(dueDateMatch[1].trim());
      }

      // Parse tags
      let tags: string[] = [];
      const tagsMatch = normalized.match(/(?:tags?|tagged|labels?)\s*:?\s*(.+?)(?:\s+(?:with|priority|due|by|in\s+(?:todo|to\s?do|in[\s-]?progress|doing|done)|description|desc)\b|$)/i);
      if (tagsMatch) {
        tags = tagsMatch[1].split(/[,;&]+/).map(t => t.trim().toLowerCase()).filter(t => t.length > 0 && t !== 'and');
      }

      // Parse description
      const descMatch = normalized.match(/(?:description|desc|details)\s*:?\s*(.+?)$/i);
      if (descMatch) {
        description = descMatch[1].trim();
      }

      // Clean title — remove any trailing keywords that might have leaked
      title = title.replace(/\s+(with|priority|due|by|tags?|tagged|in\s+(?:todo|to\s?do|in[\s-]?progress|doing|done)|description|desc)\b.*$/i, '').trim();
      // Remove quotes if present
      title = title.replace(/^["']|["']$/g, '').trim();

      if (!title) {
        return { text: `I couldn't determine the task title. Please try again with a clearer format, like:\n\n• **"Create task: Fix the login bug"**` };
      }

      const parts: string[] = [];
      parts.push(`✅ **Task created!**\n`);
      parts.push(`📋 **${title}**`);
      if (description) parts.push(`📝 ${description}`);
      parts.push(`${PRIORITY_EMOJI[priority]} Priority: **${priority}**`);
      parts.push(`📂 Column: **${COLUMN_NAMES[column]}**`);
      if (dueDate) parts.push(`📅 Due: **${dueDate}**`);
      if (tags.length > 0) parts.push(`🏷️ Tags: ${tags.map(t => `\`${t}\``).join(', ')}`);

      return {
        text: parts.join('\n'),
        action: { type: 'create', columnId: column, title, description, priority, dueDate, tags },
      };
    }
  }

  // ========= MOVE / COMPLETE / START TASK =========
  if (lower.match(/^(move|complete|finish|done\s+with|mark|start|begin)/)) {
    // Determine destination column
    let destCol: ColumnId | null = null;
    if (lower.match(/^(complete|finish|done\s+with)/) || lower.match(/mark.*(?:as\s+)?(?:done|complete)/)) {
      destCol = 'done';
    } else if (lower.match(/^(start|begin)/)) {
      destCol = 'in-progress';
    } else {
      // "move X to [column]"
      destCol = parseColumnRef(lower);
    }

    if (!destCol) {
      return { text: `Where should I move the task? Options:\n• **To Do**\n• **In Progress**\n• **Done**\n\nExample: **"Move [task name] to In Progress"**` };
    }

    // Find the task
    const { task, candidates } = findTaskInMessage(normalized, board);
    if (!task && candidates.length > 0) {
      return { text: `Which task do you mean?\n\n${formatCandidates(candidates)}\n\nPlease be more specific.` };
    }
    if (!task) {
      if (allTasks.length === 0) {
        return { text: `Your board is empty! Create some tasks first.` };
      }
      return { text: `❌ I couldn't find that task. Here are your current tasks:\n\n${allTasks.slice(0, 8).map(t => `• **${t.title}** (${COLUMN_NAMES[t.columnId]})`).join('\n')}\n\nPlease use the exact task name.` };
    }

    if (task.columnId === destCol) {
      return { text: `ℹ️ **${task.title}** is already in **${COLUMN_NAMES[destCol]}**.` };
    }

    const fromCol = COLUMN_NAMES[task.columnId];
    const toCol = COLUMN_NAMES[destCol];
    const emoji = destCol === 'done' ? '🎉' : destCol === 'in-progress' ? '🚀' : '📋';

    return {
      text: `${emoji} **${task.title}** moved from **${fromCol}** → **${toCol}**!${destCol === 'done' ? '\n\nGreat job completing this task! 🎊' : ''}`,
      action: { type: 'move', taskId: task.id, sourceCol: task.columnId, destCol },
    };
  }

  // ========= EDIT TASK =========
  if (lower.match(/^(change|set|update|edit|modify|rename|retitle)/)) {
    // Detect field
    let field: 'priority' | 'title' | 'dueDate' | 'description' | null = null;
    if (lower.match(/\b(priority|pri)\b/)) field = 'priority';
    else if (lower.match(/^rename/) || lower.match(/\b(title|name)\b/)) field = 'title';
    else if (lower.match(/\b(due|deadline|date)\b/)) field = 'dueDate';
    else if (lower.match(/\b(description|desc|details)\b/)) field = 'description';

    if (!field) {
      // Maybe it's "edit [task name]" without specifying a field — list options
      const { task, candidates } = findTaskInMessage(normalized, board);
      if (task) {
        return {
          text: `What would you like to change about **${task.title}**?\n\n• **"Change priority of ${task.title} to high"**\n• **"Rename ${task.title} to [new name]"**\n• **"Set due date of ${task.title} to tomorrow"**\n• **"Set description of ${task.title} to [text]"**\n• **"Add tag frontend to ${task.title}"**`,
        };
      }
      if (candidates.length > 0) {
        return { text: `Which task do you want to edit?\n\n${formatCandidates(candidates)}` };
      }
      return {
        text: `What would you like to edit? I can change:\n\n• **Priority** — "Change priority of [task] to high"\n• **Title** — "Rename [task] to [new name]"\n• **Due date** — "Set due date of [task] to tomorrow"\n• **Description** — "Set description of [task] to [text]"\n• **Tags** — "Add tag frontend to [task]"`,
      };
    }

    // Find the task
    const { task, candidates } = findTaskInMessage(normalized, board);
    if (!task && candidates.length > 0) {
      return { text: `Which task do you mean?\n\n${formatCandidates(candidates)}\n\nPlease be more specific.` };
    }
    if (!task) {
      return { text: `❌ I couldn't find that task. Please check the name and try again.\n\nYour tasks:\n${allTasks.slice(0, 8).map(t => `• **${t.title}**`).join('\n')}` };
    }

    switch (field) {
      case 'priority': {
        const newPriority = parsePriorityRef(lower);
        if (!newPriority || newPriority === task.priority) {
          if (newPriority === task.priority) {
            return { text: `ℹ️ **${task.title}** is already set to **${task.priority}** priority.` };
          }
          return { text: `What priority should I set for **${task.title}**? Options: **high**, **medium**, or **low**.\n\nCurrent priority: **${task.priority}**` };
        }
        return {
          text: `${PRIORITY_EMOJI[newPriority]} Updated **${task.title}** priority: **${task.priority}** → **${newPriority}**`,
          action: { type: 'update', taskId: task.id, updates: { priority: newPriority } },
        };
      }

      case 'title': {
        // Extract new title after "to" or "as"
        const titleMatch = normalized.match(/(?:to|as)\s+["']?(.+?)["']?\s*$/i);
        if (!titleMatch || !titleMatch[1].trim()) {
          return { text: `What should I rename **${task.title}** to?\n\nExample: **"Rename ${task.title} to [new name]"**` };
        }
        const newTitle = titleMatch[1].trim();
        return {
          text: `✏️ Renamed: **${task.title}** → **${newTitle}**`,
          action: { type: 'update', taskId: task.id, updates: { title: newTitle } },
        };
      }

      case 'dueDate': {
        // Extract date expression
        const datePartMatch = lower.match(/(?:to|=)\s+(.+?)$/i) || lower.match(/(?:due|deadline|date)\s+(?:to\s+|=\s+)?(.+?)$/i);
        if (!datePartMatch) {
          return { text: `When is **${task.title}** due?\n\nExamples: **tomorrow**, **next Friday**, **2025-01-15**, **in 3 days**\n\nCurrent due date: **${task.dueDate || 'not set'}**` };
        }
        const dateStr = datePartMatch[1].trim();

        // Handle "none" / "clear" / "remove"
        if (dateStr.match(/^(none|clear|remove|no date|unset|null)$/i)) {
          return {
            text: `📅 Cleared the due date for **${task.title}**.`,
            action: { type: 'update', taskId: task.id, updates: { dueDate: null } },
          };
        }

        const parsed = parseNaturalDate(dateStr);
        if (!parsed) {
          return { text: `I couldn't parse "**${dateStr}**" as a date. Try:\n• **tomorrow**, **next week**, **next friday**\n• **in 3 days**, **in 2 weeks**\n• **2025-01-15**` };
        }
        return {
          text: `📅 Updated due date of **${task.title}**: **${task.dueDate || 'none'}** → **${parsed}**`,
          action: { type: 'update', taskId: task.id, updates: { dueDate: parsed } },
        };
      }

      case 'description': {
        const descPartMatch = normalized.match(/(?:to|=)\s+["']?(.+?)["']?\s*$/i)
          || normalized.match(/description\s+(?:of\s+.+?\s+)?(?:to\s+)?["']?(.+?)["']?\s*$/i);
        if (!descPartMatch || !descPartMatch[1].trim()) {
          return { text: `What should the description be for **${task.title}**?\n\nExample: **"Set description of ${task.title} to [new description]"**\n\nCurrent: ${task.description || '(empty)'}` };
        }
        const newDesc = descPartMatch[1].trim();
        return {
          text: `📝 Updated description for **${task.title}**:\n"${newDesc}"`,
          action: { type: 'update', taskId: task.id, updates: { description: newDesc } },
        };
      }
    }
  }

  // ========= DELETE TASK =========
  if (lower.match(/^(delete|remove|trash|discard|drop)\s/)) {
    // Not "remove tag"
    if (lower.match(/^remove\s+(a\s+)?tags?\b/)) {
      // Already handled above, but just in case
      return { text: `To remove tags, say:\n• **"Remove tag frontend from [task name]"**` };
    }

    const { task, candidates } = findTaskInMessage(normalized, board);
    if (!task && candidates.length > 0) {
      return { text: `Which task do you want to delete?\n\n${formatCandidates(candidates)}\n\nPlease be more specific.` };
    }
    if (!task) {
      if (allTasks.length === 0) {
        return { text: `Your board is empty! There's nothing to delete.` };
      }
      return { text: `❌ I couldn't find that task. Here are your current tasks:\n\n${allTasks.slice(0, 8).map(t => `• **${t.title}** (${COLUMN_NAMES[t.columnId]})`).join('\n')}` };
    }

    return {
      text: `🗑️ Deleted **${task.title}** from **${COLUMN_NAMES[task.columnId]}**.\n\nYou can undo this with **Ctrl+Z**.`,
      action: { type: 'delete', taskId: task.id },
    };
  }

  // ==================== Q&A FALLBACK ====================

  // Greetings
  if (lower.match(/^(hi|hello|hey|howdy|greetings|sup|yo|good\s)/)) {
    return {
      text: `Hello! 👋 I'm your FlowBoard assistant. I can **create, edit, move, and delete tasks** for you — plus analyze your workload!\n\n🛠️ **Task Management:**\n• "Create task: Fix login bug"\n• "Add a high priority task Deploy v2 due tomorrow"\n• "Move Design homepage to done"\n• "Change priority of Review PR to high"\n• "Delete Setup project repository"\n\n📊 **Insights:**\n• "Show summary" · "What should I focus on?"\n• "Any overdue tasks?" · "Show statistics"`,
    };
  }

  // Help / what can you do
  if (lower.match(/(what can you|help|commands|capabilities|how do|what do you|features)/)) {
    return {
      text: `🤖 **Here's everything I can do:**\n\n🆕 **Create Tasks:**\n• "Create task: Fix the login bug"\n• "Add a high priority task called Review PR due tomorrow"\n• "New task Deploy v2 with tags release, devops"\n\n✏️ **Edit Tasks:**\n• "Change priority of [task] to high"\n• "Rename [task] to [new name]"\n• "Set due date of [task] to next Friday"\n• "Set description of [task] to [text]"\n• "Add tag frontend to [task]"\n• "Remove tag backend from [task]"\n\n📦 **Move Tasks:**\n• "Move [task] to In Progress"\n• "Complete [task]" / "Finish [task]"\n• "Start [task]"\n\n🗑️ **Delete Tasks:**\n• "Delete [task]"\n\n📊 **Insights & Analysis:**\n• "Show summary" · "What should I focus on?"\n• "Any overdue tasks?" · "Analyze my workload"\n• "Show statistics" · "Show my tags"\n• "Give me productivity tips"`,
    };
  }

  // Summary / overview
  if (lower.match(/(summary|overview|status|how.*(board|doing|look)|what.*going)/)) {
    return {
      text: `📊 **Board Summary**\n\n` +
        `• **To Do:** ${todoTasks.length} task${todoTasks.length !== 1 ? 's' : ''}\n` +
        `• **In Progress:** ${inProgressTasks.length} task${inProgressTasks.length !== 1 ? 's' : ''}\n` +
        `• **Done:** ${doneTasks.length} task${doneTasks.length !== 1 ? 's' : ''}\n` +
        `• **Total:** ${allTasks.length} task${allTasks.length !== 1 ? 's' : ''}\n\n` +
        (overdueTasks.length > 0 ? `⚠️ **${overdueTasks.length} overdue** need attention!\n\n` : '') +
        (highPriorityTasks.length > 0 ? `🔴 ${highPriorityTasks.length} high-priority pending.\n\n` : '') +
        `Completion rate: **${allTasks.length > 0 ? Math.round((doneTasks.length / allTasks.length) * 100) : 0}%**`,
    };
  }

  // Overdue
  if (lower.match(/(overdue|late|behind|missed|past.due)/)) {
    if (overdueTasks.length === 0) {
      return { text: `✅ Great news! You have **no overdue tasks**. Keep it up! 🎉` };
    }
    const taskList = overdueTasks.map((t: Task) => `• **${t.title}** (Due: ${t.dueDate})`).join('\n');
    return {
      text: `⚠️ You have **${overdueTasks.length} overdue task${overdueTasks.length !== 1 ? 's' : ''}**:\n\n${taskList}\n\nWant me to help? I can:\n• **"Complete [task name]"** to mark one done\n• **"Set due date of [task] to tomorrow"** to reschedule`,
    };
  }

  // Priority / what to focus on
  if (lower.match(/(priorit|focus|what.*should|suggest|recommend|important|urgent)/)) {
    if (highPriorityTasks.length === 0 && overdueTasks.length === 0) {
      return { text: `🎯 You're in great shape! No urgent tasks.\n\nConsider:\n1. Working on medium-priority tasks\n2. Planning for upcoming due dates\n3. Breaking down larger tasks` };
    }
    let response = `🎯 **Prioritization Suggestions:**\n\n`;
    if (overdueTasks.length > 0) {
      response += `**1. Tackle overdue tasks first:**\n`;
      overdueTasks.slice(0, 3).forEach((t: Task) => { response += `   • ${t.title} (${t.priority} priority)\n`; });
      response += `\n`;
    }
    if (highPriorityTasks.length > 0) {
      response += `**${overdueTasks.length > 0 ? '2' : '1'}. High-priority tasks:**\n`;
      highPriorityTasks.filter(t => !isOverdue(t.dueDate)).slice(0, 3).forEach((t: Task) => {
        response += `   • ${t.title}${t.dueDate ? ` (Due: ${t.dueDate})` : ''}\n`;
      });
      response += `\n`;
    }
    response += `💡 Try **"Complete [task]"** or **"Start [task]"** to take action!`;
    return { text: response };
  }

  // Workload
  if (lower.match(/(workload|busy|capacity|how much|load)/)) {
    const activeCount = todoTasks.length + inProgressTasks.length;
    let assessment = '';
    if (activeCount <= 3) assessment = `Your workload is **light** (${activeCount} active). Room for more! 💪`;
    else if (activeCount <= 7) assessment = `Your workload is **moderate** (${activeCount} active). Good balance! ⚖️`;
    else if (activeCount <= 12) assessment = `Your workload is **heavy** (${activeCount} active). Be careful! 🏋️`;
    else assessment = `Your workload is **very heavy** (${activeCount} active). Consider delegating. 🚨`;

    return {
      text: `📈 **Workload Analysis**\n\n${assessment}\n\n` +
        `• ${todoTasks.length} waiting to start\n• ${inProgressTasks.length} in progress\n\n` +
        `${inProgressTasks.length > 4 ? '💡 Reduce WIP items — focus on finishing before starting new tasks.' : ''}`,
    };
  }

  // Tags / categories
  if (lower.match(/(show.*tag|tag.*distribut|categor|label|group|list.*tag)/)) {
    const tagCounts: Record<string, number> = {};
    allTasks.forEach((t: Task) => t.tags.forEach(tag => { tagCounts[tag] = (tagCounts[tag] || 0) + 1; }));
    const tagEntries = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
    if (tagEntries.length === 0) return { text: `You haven't used any tags yet. 🏷️\n\nTry: **"Add tag design to [task name]"**` };
    const tagList = tagEntries.map(([tag, count]) => `• **${tag}** — ${count} task${count !== 1 ? 's' : ''}`).join('\n');
    return { text: `🏷️ **Tag Distribution:**\n\n${tagList}` };
  }

  // List tasks
  if (lower.match(/(list|show|display)\s+(all\s+)?tasks?/) || lower.match(/what\s+tasks?\s+do\s+i\s+have/) || lower.match(/^(my\s+)?tasks$/)) {
    if (allTasks.length === 0) {
      return { text: `Your board is empty! Start by saying **"Create task: [title]"**` };
    }
    let response = `📋 **Your Tasks (${allTasks.length}):**\n\n`;
    for (const colId of ['todo', 'in-progress', 'done'] as ColumnId[]) {
      const colTasks = allTasks.filter(t => t.columnId === colId);
      if (colTasks.length > 0) {
        response += `**${COLUMN_NAMES[colId]}** (${colTasks.length}):\n`;
        colTasks.forEach(t => {
          response += `• ${PRIORITY_EMOJI[t.priority]} ${t.title}${t.dueDate ? ` 📅 ${t.dueDate}` : ''}${isOverdue(t.dueDate) && t.columnId !== 'done' ? ' ⚠️' : ''}\n`;
        });
        response += `\n`;
      }
    }
    return { text: response.trim() };
  }

  // Tips
  if (lower.match(/(tip|advice|productiv|efficien)/)) {
    const tips = [
      `🎯 **Focus on ONE task at a time.** Multitasking reduces productivity by up to 40%.`,
      `⏰ **Use the 2-minute rule:** If it takes less than 2 minutes, do it now.`,
      `📋 **Break large tasks down** into smaller sub-tasks.`,
      `🔄 **Review your board daily.** 5 minutes each morning for planning.`,
      `🚫 **Limit WIP to 3-4 tasks.** Too many in-progress = context switching.`,
      `📅 **Set realistic due dates.** Unrealistic deadlines cause stress.`,
      `✅ **Celebrate completions!** Moving to Done feels great.`,
    ];
    const picked = tips.sort(() => Math.random() - 0.5).slice(0, 3);
    return { text: `💡 **Productivity Tips:**\n\n${picked.join('\n\n')}` };
  }

  // Stats
  if (lower.match(/(stat|number|metric|count|data|analytic)/)) {
    const avgTags = allTasks.length > 0 ? (allTasks.reduce((s: number, t: Task) => s + t.tags.length, 0) / allTasks.length).toFixed(1) : '0';
    const withDue = allTasks.filter(t => t.dueDate).length;
    return {
      text: `📊 **Board Statistics:**\n\n` +
        `• Total tasks: **${allTasks.length}**\n` +
        `• Completion rate: **${allTasks.length > 0 ? Math.round((doneTasks.length / allTasks.length) * 100) : 0}%**\n` +
        `• High priority: **${allTasks.filter(t => t.priority === 'high').length}**\n` +
        `• Medium priority: **${allTasks.filter(t => t.priority === 'medium').length}**\n` +
        `• Low priority: **${allTasks.filter(t => t.priority === 'low').length}**\n` +
        `• With due dates: **${withDue}**\n` +
        `• Overdue: **${overdueTasks.length}**\n` +
        `• Avg tags/task: **${avgTags}**`,
    };
  }

  // Thank you
  if (lower.match(/(thank|thanks|thx|appreciate)/)) {
    return { text: `You're welcome! 😊 Let me know if you need anything else!` };
  }

  // Default
  return {
    text: `I can help with that! Here's what I can do:\n\n` +
      `🛠️ **Manage Tasks:**\n` +
      `• **"Create task: [title]"** — Add a new task\n` +
      `• **"Move [task] to done"** — Change task status\n` +
      `• **"Change priority of [task] to high"** — Edit task\n` +
      `• **"Delete [task]"** — Remove a task\n\n` +
      `📊 **Get Insights:**\n` +
      `• **"Show summary"** — Board overview\n` +
      `• **"What should I focus on?"** — Priorities\n` +
      `• **"List my tasks"** — See all tasks\n` +
      `• **"Show statistics"** — Detailed metrics`,
  };
}

// ==================== COMPONENT ====================

export function Chatbot({ board, onAddTask, onUpdateTask, onDeleteTask, onMoveTask }: ChatbotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: uuidv4(),
      role: 'assistant',
      content: `Hi! 👋 I'm your FlowBoard AI assistant. I can **create, edit, move, and delete tasks** for you — plus help you stay productive!\n\nTry me:\n• "Create task: Fix login bug"\n• "Move Design homepage to done"\n• "What should I focus on?"\n• Type **"help"** to see all commands`,
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const executeAction = useCallback((action: ChatBotAction) => {
    switch (action.type) {
      case 'create':
        onAddTask(action.columnId, action.title, action.description, action.priority, action.dueDate, action.tags);
        break;
      case 'update':
        onUpdateTask(action.taskId, action.updates);
        break;
      case 'delete':
        onDeleteTask(action.taskId);
        break;
      case 'move':
        onMoveTask(action.taskId, action.sourceCol, action.destCol, board.columns[action.destCol].taskIds.length);
        break;
    }
  }, [board, onAddTask, onUpdateTask, onDeleteTask, onMoveTask]);

  const sendMessage = useCallback(() => {
    if (!input.trim() || isTyping) return;
    const userMsg: ChatMessage = {
      id: uuidv4(), role: 'user', content: input.trim(), timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    const currentInput = input.trim();
    setInput('');
    setIsTyping(true);

    setTimeout(() => {
      const response = processMessage(currentInput, board);

      // Execute action if present
      if (response.action) {
        executeAction(response.action);
      }

      const assistantMsg: ChatMessage = {
        id: uuidv4(), role: 'assistant', content: response.text, timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, assistantMsg]);
      setIsTyping(false);
    }, 400 + Math.random() * 600);
  }, [input, isTyping, board, executeAction]);

  const formatMessageContent = (content: string) => {
    return content.split('\n').map((line, i) => {
      // Bold and code formatting
      let formatted = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      formatted = formatted.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[10px] font-mono">$1</code>');
      return <p key={i} className={line === '' ? 'h-2' : ''} dangerouslySetInnerHTML={{ __html: formatted }} />;
    });
  };

  return (
    <>
      {/* Chat Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 z-[60] w-14 h-14 rounded-full shadow-xl transition-all duration-300 flex items-center justify-center ${
          isOpen
            ? 'bg-gray-800 hover:bg-gray-900 rotate-0'
            : 'bg-gradient-to-br from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 hover:scale-110'
        }`}
      >
        {isOpen ? <X size={22} className="text-white" /> : (
          <div className="relative">
            <MessageCircle size={22} className="text-white" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-white" />
          </div>
        )}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-[400px] max-h-[600px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-in zoom-in-95 fade-in">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-4 flex items-center gap-3 flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
              <Sparkles size={20} className="text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-white font-bold text-sm">FlowBoard AI</h3>
              <p className="text-white/70 text-xs flex items-center gap-1">
                <Zap size={10} />
                Can create, edit & manage tasks
              </p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0" style={{ maxHeight: '420px' }}>
            {messages.map(msg => (
              <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                  msg.role === 'assistant' ? 'bg-indigo-100' : 'bg-gray-100'
                }`}>
                  {msg.role === 'assistant' ? <Bot size={14} className="text-indigo-600" /> : <User size={14} className="text-gray-600" />}
                </div>
                <div className={`max-w-[82%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed ${
                  msg.role === 'assistant'
                    ? 'bg-gray-100 text-gray-800 rounded-tl-sm'
                    : 'bg-indigo-600 text-white rounded-tr-sm'
                }`}>
                  {formatMessageContent(msg.content)}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex gap-2.5">
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center">
                  <Bot size={14} className="text-indigo-600" />
                </div>
                <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Actions */}
          <div className="px-3 pt-2 flex gap-1.5 flex-wrap flex-shrink-0">
            {[
              { label: '➕ New Task', cmd: 'Create task: ', prefill: true },
              { label: '📋 My Tasks', cmd: 'List my tasks', prefill: false },
              { label: '📊 Summary', cmd: 'Show summary', prefill: false },
              { label: '🎯 Focus', cmd: 'What should I focus on?', prefill: false },
            ].map(q => (
              <button
                key={q.label}
                onClick={() => {
                  if (q.prefill) {
                    setInput(q.cmd);
                    inputRef.current?.focus();
                  } else {
                    // Send the command directly
                    if (isTyping) return;
                    const userMsg: ChatMessage = {
                      id: uuidv4(), role: 'user', content: q.cmd, timestamp: new Date().toISOString(),
                    };
                    setMessages(prev => [...prev, userMsg]);
                    setIsTyping(true);
                    setTimeout(() => {
                      const response = processMessage(q.cmd, board);
                      if (response.action) executeAction(response.action);
                      setMessages(prev => [...prev, {
                        id: uuidv4(), role: 'assistant', content: response.text, timestamp: new Date().toISOString(),
                      }]);
                      setIsTyping(false);
                    }, 400 + Math.random() * 600);
                  }
                }}
                disabled={isTyping}
                className="px-2.5 py-1 bg-gray-50 hover:bg-indigo-50 text-gray-600 hover:text-indigo-700 rounded-lg text-[10px] font-medium transition-colors border border-gray-100 hover:border-indigo-200 disabled:opacity-50"
              >
                {q.label}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-gray-100 bg-gray-50/50 flex-shrink-0">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') sendMessage(); }}
                placeholder="Create, edit, or ask about tasks..."
                className="flex-1 px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none transition-all bg-white text-gray-800 placeholder:text-gray-400"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || isTyping}
                className="px-3.5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl hover:from-indigo-700 hover:to-violet-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
              >
                {isTyping ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
