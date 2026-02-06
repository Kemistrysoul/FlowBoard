import { Draggable } from '@hello-pangea/dnd';
import { Calendar, Tag, Pencil, Trash2, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Task } from '../types';
import { isOverdue, isDueToday, formatDate, timeAgo } from '../utils/export';

interface TaskCardProps {
  task: Task;
  index: number;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
}

const priorityConfig = {
  high: { label: 'High', dotColor: 'bg-red-500', bgColor: 'bg-red-50', textColor: 'text-red-700', borderColor: 'border-l-red-500' },
  medium: { label: 'Medium', dotColor: 'bg-amber-500', bgColor: 'bg-amber-50', textColor: 'text-amber-700', borderColor: 'border-l-amber-500' },
  low: { label: 'Low', dotColor: 'bg-emerald-500', bgColor: 'bg-emerald-50', textColor: 'text-emerald-700', borderColor: 'border-l-emerald-500' },
};

export function TaskCard({ task, index, onEdit, onDelete }: TaskCardProps) {
  const priority = priorityConfig[task.priority];
  const overdue = task.columnId !== 'done' && isOverdue(task.dueDate);
  const dueToday = task.columnId !== 'done' && isDueToday(task.dueDate);
  const isDone = task.columnId === 'done';

  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`group bg-white rounded-xl border-l-[3px] ${priority.borderColor} shadow-sm hover:shadow-md transition-all duration-200 mb-2.5 ${
            snapshot.isDragging ? 'shadow-xl rotate-[2deg] scale-[1.02] z-50' : ''
          } ${isDone ? 'opacity-75' : ''}`}
        >
          <div className="p-3.5">
            {/* Header row */}
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3 className={`font-semibold text-sm text-gray-900 leading-snug flex-1 ${isDone ? 'line-through text-gray-500' : ''}`}>
                {task.title}
              </h3>
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit(task); }}
                  className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            {/* Description */}
            {task.description && (
              <p className="text-xs text-gray-500 mb-2.5 line-clamp-2 leading-relaxed">{task.description}</p>
            )}

            {/* Priority badge */}
            <div className="flex items-center gap-2 flex-wrap mb-2.5">
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${priority.bgColor} ${priority.textColor}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${priority.dotColor}`} />
                {priority.label}
              </span>
              {isDone && task.completedAt && (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                  <CheckCircle2 size={10} />
                  Done
                </span>
              )}
            </div>

            {/* Tags */}
            {task.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2.5">
                {task.tags.map(tag => (
                  <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[10px] font-medium">
                    <Tag size={8} />
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between text-[10px] text-gray-400 pt-1.5 border-t border-gray-50">
              <span className="flex items-center gap-1">
                <Clock size={10} />
                {timeAgo(task.createdAt)}
              </span>
              {task.dueDate && (
                <span className={`flex items-center gap-1 font-medium ${
                  overdue ? 'text-red-600' : dueToday ? 'text-amber-600' : 'text-gray-500'
                }`}>
                  {overdue && <AlertCircle size={10} />}
                  <Calendar size={10} />
                  {overdue ? 'Overdue · ' : dueToday ? 'Today · ' : ''}{formatDate(task.dueDate)}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </Draggable>
  );
}
