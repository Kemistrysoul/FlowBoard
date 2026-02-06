import { Droppable } from '@hello-pangea/dnd';
import { Plus, ListTodo, Loader2, CheckCircle } from 'lucide-react';
import { Task, ColumnId } from '../types';
import { TaskCard } from './TaskCard';

interface ColumnProps {
  columnId: ColumnId;
  title: string;
  tasks: Task[];
  onAddTask: (columnId: ColumnId) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
}

const columnConfig: Record<ColumnId, { icon: typeof ListTodo; gradient: string; badge: string; dropBg: string }> = {
  'todo': {
    icon: ListTodo,
    gradient: 'from-blue-500 to-indigo-500',
    badge: 'bg-blue-100 text-blue-700',
    dropBg: 'bg-blue-50/50',
  },
  'in-progress': {
    icon: Loader2,
    gradient: 'from-amber-500 to-orange-500',
    badge: 'bg-amber-100 text-amber-700',
    dropBg: 'bg-amber-50/50',
  },
  'done': {
    icon: CheckCircle,
    gradient: 'from-emerald-500 to-teal-500',
    badge: 'bg-emerald-100 text-emerald-700',
    dropBg: 'bg-emerald-50/50',
  },
};

export function Column({ columnId, title, tasks, onAddTask, onEditTask, onDeleteTask }: ColumnProps) {
  const config = columnConfig[columnId];
  const Icon = config.icon;

  return (
    <div className="flex flex-col w-80 min-w-[320px] flex-shrink-0">
      {/* Column Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${config.gradient} flex items-center justify-center shadow-sm`}>
            <Icon size={16} className="text-white" />
          </div>
          <h2 className="font-bold text-gray-800 text-sm">{title}</h2>
          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${config.badge}`}>
            {tasks.length}
          </span>
        </div>
        <button
          onClick={() => onAddTask(columnId)}
          className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
          title="Add task"
        >
          <Plus size={18} />
        </button>
      </div>

      {/* Droppable Area */}
      <Droppable droppableId={columnId}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 rounded-xl p-2 min-h-[200px] transition-colors duration-200 ${
              snapshot.isDraggingOver ? `${config.dropBg} ring-2 ring-inset ring-gray-200` : 'bg-gray-50/80'
            }`}
          >
            {tasks.length === 0 && !snapshot.isDraggingOver && (
              <div className="flex flex-col items-center justify-center h-32 text-gray-400">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-2">
                  <Plus size={20} className="text-gray-300" />
                </div>
                <p className="text-xs font-medium">No tasks yet</p>
                <p className="text-[10px] text-gray-300 mt-0.5">Drag here or click + to add</p>
              </div>
            )}
            {tasks.map((task, index) => (
              <TaskCard
                key={task.id}
                task={task}
                index={index}
                onEdit={onEditTask}
                onDelete={onDeleteTask}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
