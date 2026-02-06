import { useState, useMemo, useCallback, useEffect } from 'react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import {
  Undo2, Redo2, Save, Download, RotateCcw, Trash2,
  Layers, CloudOff, Cloud, Keyboard
} from 'lucide-react';
import { useBoard } from './hooks/useBoard';
import { Column } from './components/Column';
import { TaskModal } from './components/TaskModal';
import { ConfirmDialog } from './components/ConfirmDialog';
import { SearchFilter } from './components/SearchFilter';
import { Chatbot } from './components/Chatbot';
import { exportToCSV, isOverdue, isDueToday, isDueThisWeek } from './utils/export';
import { Task, ColumnId, SortOption, FilterPriority, FilterDueDate } from './types';

export function App() {
  const {
    board, saving,
    addTask, updateTask, deleteTask, moveTask,
    undo, redo, canUndo, canRedo,
    manualSave, resetBoard, clearBoard,
  } = useBoard();

  // Modal states
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [defaultColumn, setDefaultColumn] = useState<ColumnId>('todo');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  // Search & Filter
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('created');
  const [filterPriority, setFilterPriority] = useState<FilterPriority>('all');
  const [filterDueDate, setFilterDueDate] = useState<FilterDueDate>('all');
  const [filterTag, setFilterTag] = useState('');

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'y') { e.preventDefault(); redo(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); manualSave(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') { e.preventDefault(); handleAddTask('todo'); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, manualSave]);

  // Get all unique tags
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    Object.values(board.tasks).forEach(t => t.tags.forEach(tag => tags.add(tag)));
    return Array.from(tags).sort();
  }, [board.tasks]);

  // Filter & sort tasks
  const getFilteredTasks = useCallback((taskIds: string[]): Task[] => {
    let tasks = taskIds
      .map(id => board.tasks[id])
      .filter(Boolean);

    // Search
    if (search) {
      const q = search.toLowerCase();
      tasks = tasks.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some(tag => tag.toLowerCase().includes(q))
      );
    }

    // Filter priority
    if (filterPriority !== 'all') {
      tasks = tasks.filter(t => t.priority === filterPriority);
    }

    // Filter due date
    if (filterDueDate !== 'all') {
      tasks = tasks.filter(t => {
        switch (filterDueDate) {
          case 'overdue': return isOverdue(t.dueDate);
          case 'today': return isDueToday(t.dueDate);
          case 'this-week': return isDueThisWeek(t.dueDate);
          case 'no-date': return !t.dueDate;
          default: return true;
        }
      });
    }

    // Filter tag
    if (filterTag) {
      tasks = tasks.filter(t => t.tags.includes(filterTag));
    }

    // Sort
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    tasks.sort((a, b) => {
      switch (sortBy) {
        case 'priority':
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        case 'dueDate':
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        case 'created':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return tasks;
  }, [board.tasks, search, filterPriority, filterDueDate, filterTag, sortBy]);

  // Stats
  const stats = useMemo(() => {
    const all = Object.values(board.tasks);
    return {
      total: all.length,
      todo: board.columns['todo'].taskIds.length,
      inProgress: board.columns['in-progress'].taskIds.length,
      done: board.columns['done'].taskIds.length,
      overdue: all.filter(t => t.columnId !== 'done' && isOverdue(t.dueDate)).length,
    };
  }, [board]);

  // Handlers
  const handleAddTask = (columnId: ColumnId) => {
    setEditingTask(null);
    setDefaultColumn(columnId);
    setTaskModalOpen(true);
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setDefaultColumn(task.columnId);
    setTaskModalOpen(true);
  };

  const handleDeleteRequest = (taskId: string) => {
    setDeleteTaskId(taskId);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (deleteTaskId) deleteTask(deleteTaskId);
    setDeleteConfirmOpen(false);
    setDeleteTaskId(null);
  };

  const handleSaveTask = (data: {
    title: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    dueDate: string | null;
    tags: string[];
    columnId: ColumnId;
  }) => {
    if (editingTask) {
      // If column changed, we need to move the task
      if (editingTask.columnId !== data.columnId) {
        moveTask(editingTask.id, editingTask.columnId, data.columnId, board.columns[data.columnId].taskIds.length);
      }
      updateTask(editingTask.id, {
        title: data.title,
        description: data.description,
        priority: data.priority,
        dueDate: data.dueDate,
        tags: data.tags,
        columnId: data.columnId,
      });
    } else {
      addTask(data.columnId, data.title, data.description, data.priority, data.dueDate, data.tags);
    }
  };

  const onDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;
    moveTask(
      draggableId,
      source.droppableId as ColumnId,
      destination.droppableId as ColumnId,
      destination.index
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-zinc-100">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-200/50 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-200/50">
                <Layers size={18} className="text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 tracking-tight">FlowBoard</h1>
                <p className="text-[10px] text-gray-400 -mt-0.5 font-medium">Kanban Task Manager</p>
              </div>
            </div>

            {/* Stats pills */}
            <div className="hidden md:flex items-center gap-2">
              <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-semibold">{stats.todo} To Do</span>
              <span className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-lg text-xs font-semibold">{stats.inProgress} Active</span>
              <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-semibold">{stats.done} Done</span>
              {stats.overdue > 0 && (
                <span className="px-2.5 py-1 bg-red-50 text-red-700 rounded-lg text-xs font-semibold animate-pulse">{stats.overdue} Overdue</span>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1">
              <div className="flex items-center gap-0.5 mr-2">
                <button
                  onClick={undo}
                  disabled={!canUndo}
                  title="Undo (Ctrl+Z)"
                  className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Undo2 size={16} />
                </button>
                <button
                  onClick={redo}
                  disabled={!canRedo}
                  title="Redo (Ctrl+Shift+Z)"
                  className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Redo2 size={16} />
                </button>
              </div>

              <div className="w-px h-6 bg-gray-200 mx-1" />

              <button
                onClick={manualSave}
                title="Save (Ctrl+S)"
                className="p-2 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all relative"
              >
                <Save size={16} />
              </button>

              <button
                onClick={() => exportToCSV(board)}
                title="Export CSV"
                className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
              >
                <Download size={16} />
              </button>

              <div className="w-px h-6 bg-gray-200 mx-1" />

              <button
                onClick={() => setResetConfirmOpen(true)}
                title="Reset to sample data"
                className="p-2 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
              >
                <RotateCcw size={16} />
              </button>

              <button
                onClick={() => setClearConfirmOpen(true)}
                title="Clear all tasks"
                className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
              >
                <Trash2 size={16} />
              </button>

              {/* Save indicator */}
              <div className="ml-2 flex items-center gap-1.5">
                {saving ? (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                    <Cloud size={12} className="animate-pulse" />
                    Saving...
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] text-gray-400 font-medium">
                    <CloudOff size={12} />
                    Saved
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4">
        <SearchFilter
          search={search}
          onSearchChange={setSearch}
          sortBy={sortBy}
          onSortChange={setSortBy}
          filterPriority={filterPriority}
          onFilterPriorityChange={setFilterPriority}
          filterDueDate={filterDueDate}
          onFilterDueDateChange={setFilterDueDate}
          filterTag={filterTag}
          onFilterTagChange={setFilterTag}
          allTags={allTags}
        />
      </div>

      {/* Keyboard shortcut hint */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 pb-2">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
          <Keyboard size={10} />
          <span>Ctrl+Z Undo · Ctrl+Shift+Z Redo · Ctrl+S Save · Ctrl+N New Task</span>
        </div>
      </div>

      {/* Board */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 pb-24">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-5 overflow-x-auto pb-4 min-h-[calc(100vh-220px)]">
            {board.columnOrder.map(columnId => {
              const column = board.columns[columnId];
              const tasks = getFilteredTasks(column.taskIds);
              return (
                <Column
                  key={columnId}
                  columnId={columnId}
                  title={column.title}
                  tasks={tasks}
                  onAddTask={handleAddTask}
                  onEditTask={handleEditTask}
                  onDeleteTask={handleDeleteRequest}
                />
              );
            })}
          </div>
        </DragDropContext>
      </div>

      {/* Task Modal */}
      <TaskModal
        open={taskModalOpen}
        task={editingTask}
        defaultColumn={defaultColumn}
        onSave={handleSaveTask}
        onClose={() => { setTaskModalOpen(false); setEditingTask(null); }}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete Task"
        message="Are you sure you want to delete this task? This action can be undone with Ctrl+Z."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => { setDeleteConfirmOpen(false); setDeleteTaskId(null); }}
      />

      {/* Reset Confirmation */}
      <ConfirmDialog
        open={resetConfirmOpen}
        title="Reset Board"
        message="This will replace all current tasks with sample data. You can undo this action."
        confirmLabel="Reset"
        variant="warning"
        onConfirm={() => { resetBoard(); setResetConfirmOpen(false); }}
        onCancel={() => setResetConfirmOpen(false)}
      />

      {/* Clear Confirmation */}
      <ConfirmDialog
        open={clearConfirmOpen}
        title="Clear All Tasks"
        message="This will remove all tasks from the board. You can undo this action."
        confirmLabel="Clear All"
        variant="danger"
        onConfirm={() => { clearBoard(); setClearConfirmOpen(false); }}
        onCancel={() => setClearConfirmOpen(false)}
      />

      {/* Chatbot */}
      <Chatbot
        board={board}
        onAddTask={addTask}
        onUpdateTask={updateTask}
        onDeleteTask={deleteTask}
        onMoveTask={moveTask}
      />
    </div>
  );
}
