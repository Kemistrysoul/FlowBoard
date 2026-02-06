import { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { BoardState, ColumnId, Task, Priority } from '../types';

const STORAGE_KEY = 'flowboard-data';

function createDefaultBoard(): BoardState {
  const sampleTasks: Task[] = [
    {
      id: uuidv4(), title: 'Design homepage mockup', description: 'Create wireframes and high-fidelity mockups for the new landing page redesign.',
      priority: 'high', dueDate: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10),
      tags: ['design', 'ui'], createdAt: new Date(Date.now() - 86400000 * 3).toISOString(), completedAt: null, columnId: 'todo'
    },
    {
      id: uuidv4(), title: 'Set up CI/CD pipeline', description: 'Configure GitHub Actions for automated testing and deployment.',
      priority: 'medium', dueDate: new Date(Date.now() + 86400000 * 5).toISOString().slice(0, 10),
      tags: ['devops', 'backend'], createdAt: new Date(Date.now() - 86400000 * 2).toISOString(), completedAt: null, columnId: 'todo'
    },
    {
      id: uuidv4(), title: 'Write API documentation', description: 'Document all REST API endpoints with request/response examples.',
      priority: 'low', dueDate: new Date(Date.now() + 86400000 * 7).toISOString().slice(0, 10),
      tags: ['docs'], createdAt: new Date(Date.now() - 86400000 * 1).toISOString(), completedAt: null, columnId: 'todo'
    },
    {
      id: uuidv4(), title: 'Implement user authentication', description: 'Build login/signup flow with OAuth and JWT tokens.',
      priority: 'high', dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      tags: ['backend', 'security'], createdAt: new Date(Date.now() - 86400000 * 5).toISOString(), completedAt: null, columnId: 'in-progress'
    },
    {
      id: uuidv4(), title: 'Optimize database queries', description: 'Review and optimize slow SQL queries identified in performance monitoring.',
      priority: 'medium', dueDate: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
      tags: ['backend', 'performance'], createdAt: new Date(Date.now() - 86400000 * 4).toISOString(), completedAt: null, columnId: 'in-progress'
    },
    {
      id: uuidv4(), title: 'Setup project repository', description: 'Initialize repo with proper folder structure, linting, and README.',
      priority: 'high', dueDate: null,
      tags: ['devops'], createdAt: new Date(Date.now() - 86400000 * 10).toISOString(), completedAt: new Date(Date.now() - 86400000 * 7).toISOString(), columnId: 'done'
    },
  ];

  const tasks: Record<string, Task> = {};
  sampleTasks.forEach(t => { tasks[t.id] = t; });

  return {
    tasks,
    columns: {
      'todo': { id: 'todo', title: 'To Do', taskIds: sampleTasks.filter(t => t.columnId === 'todo').map(t => t.id) },
      'in-progress': { id: 'in-progress', title: 'In Progress', taskIds: sampleTasks.filter(t => t.columnId === 'in-progress').map(t => t.id) },
      'done': { id: 'done', title: 'Done', taskIds: sampleTasks.filter(t => t.columnId === 'done').map(t => t.id) },
    },
    columnOrder: ['todo', 'in-progress', 'done'],
  };
}

function loadBoard(): BoardState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return createDefaultBoard();
}

function saveBoard(board: BoardState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
}

export function useBoard() {
  const [board, setBoard] = useState<BoardState>(loadBoard);
  const [history, setHistory] = useState<BoardState[]>([]);
  const [future, setFuture] = useState<BoardState[]>([]);
  const [saving, setSaving] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-save with debounce
  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      setSaving(true);
      saveBoard(board);
      setTimeout(() => setSaving(false), 500);
    }, 300);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [board]);

  const pushHistory = useCallback((prev: BoardState) => {
    setHistory(h => [...h.slice(-49), prev]);
    setFuture([]);
  }, []);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setFuture(f => [...f, board]);
    setHistory(h => h.slice(0, -1));
    setBoard(prev);
  }, [history, board]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[future.length - 1];
    setHistory(h => [...h, board]);
    setFuture(f => f.slice(0, -1));
    setBoard(next);
  }, [future, board]);

  const addTask = useCallback((
    columnId: ColumnId,
    title: string,
    description: string,
    priority: Priority,
    dueDate: string | null,
    tags: string[]
  ) => {
    pushHistory(board);
    const id = uuidv4();
    const task: Task = {
      id, title, description, priority, dueDate, tags,
      createdAt: new Date().toISOString(),
      completedAt: columnId === 'done' ? new Date().toISOString() : null,
      columnId,
    };
    setBoard(prev => ({
      ...prev,
      tasks: { ...prev.tasks, [id]: task },
      columns: {
        ...prev.columns,
        [columnId]: {
          ...prev.columns[columnId],
          taskIds: [...prev.columns[columnId].taskIds, id],
        },
      },
    }));
    return id;
  }, [board, pushHistory]);

  const updateTask = useCallback((taskId: string, updates: Partial<Omit<Task, 'id' | 'createdAt'>>) => {
    pushHistory(board);
    setBoard(prev => ({
      ...prev,
      tasks: {
        ...prev.tasks,
        [taskId]: { ...prev.tasks[taskId], ...updates },
      },
    }));
  }, [board, pushHistory]);

  const deleteTask = useCallback((taskId: string) => {
    pushHistory(board);
    setBoard(prev => {
      const task = prev.tasks[taskId];
      if (!task) return prev;
      const newTasks = { ...prev.tasks };
      delete newTasks[taskId];
      return {
        ...prev,
        tasks: newTasks,
        columns: {
          ...prev.columns,
          [task.columnId]: {
            ...prev.columns[task.columnId],
            taskIds: prev.columns[task.columnId].taskIds.filter(id => id !== taskId),
          },
        },
      };
    });
  }, [board, pushHistory]);

  const moveTask = useCallback((taskId: string, sourceCol: ColumnId, destCol: ColumnId, destIndex: number) => {
    pushHistory(board);
    setBoard(prev => {
      const sourceTaskIds = [...prev.columns[sourceCol].taskIds];
      sourceTaskIds.splice(sourceTaskIds.indexOf(taskId), 1);

      let destTaskIds: string[];
      if (sourceCol === destCol) {
        destTaskIds = sourceTaskIds;
      } else {
        destTaskIds = [...prev.columns[destCol].taskIds];
      }
      destTaskIds.splice(destIndex, 0, taskId);

      const updatedTask = {
        ...prev.tasks[taskId],
        columnId: destCol,
        completedAt: destCol === 'done' && !prev.tasks[taskId].completedAt
          ? new Date().toISOString()
          : destCol !== 'done' ? null : prev.tasks[taskId].completedAt,
      };

      return {
        ...prev,
        tasks: { ...prev.tasks, [taskId]: updatedTask },
        columns: {
          ...prev.columns,
          [sourceCol]: { ...prev.columns[sourceCol], taskIds: sourceCol === destCol ? destTaskIds : sourceTaskIds },
          ...(sourceCol !== destCol ? { [destCol]: { ...prev.columns[destCol], taskIds: destTaskIds } } : {}),
        },
      };
    });
  }, [board, pushHistory]);

  const manualSave = useCallback(() => {
    setSaving(true);
    saveBoard(board);
    setTimeout(() => setSaving(false), 800);
  }, [board]);

  const resetBoard = useCallback(() => {
    pushHistory(board);
    const newBoard = createDefaultBoard();
    setBoard(newBoard);
    saveBoard(newBoard);
  }, [board, pushHistory]);

  const clearBoard = useCallback(() => {
    pushHistory(board);
    const emptyBoard: BoardState = {
      tasks: {},
      columns: {
        'todo': { id: 'todo', title: 'To Do', taskIds: [] },
        'in-progress': { id: 'in-progress', title: 'In Progress', taskIds: [] },
        'done': { id: 'done', title: 'Done', taskIds: [] },
      },
      columnOrder: ['todo', 'in-progress', 'done'],
    };
    setBoard(emptyBoard);
    saveBoard(emptyBoard);
  }, [board, pushHistory]);

  return {
    board, saving,
    addTask, updateTask, deleteTask, moveTask,
    undo, redo,
    canUndo: history.length > 0,
    canRedo: future.length > 0,
    manualSave, resetBoard, clearBoard,
  };
}
