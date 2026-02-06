export type Priority = 'high' | 'medium' | 'low';
export type ColumnId = 'todo' | 'in-progress' | 'done';

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  dueDate: string | null;
  tags: string[];
  createdAt: string;
  completedAt: string | null;
  columnId: ColumnId;
}

export interface Column {
  id: ColumnId;
  title: string;
  taskIds: string[];
}

export interface BoardState {
  tasks: Record<string, Task>;
  columns: Record<ColumnId, Column>;
  columnOrder: ColumnId[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export type SortOption = 'created' | 'dueDate' | 'priority';
export type FilterPriority = Priority | 'all';
export type FilterDueDate = 'all' | 'overdue' | 'today' | 'this-week' | 'no-date';
