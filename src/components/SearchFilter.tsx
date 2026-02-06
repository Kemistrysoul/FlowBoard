import { Search, Filter, SortAsc, X, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { SortOption, FilterPriority, FilterDueDate } from '../types';

interface SearchFilterProps {
  search: string;
  onSearchChange: (v: string) => void;
  sortBy: SortOption;
  onSortChange: (v: SortOption) => void;
  filterPriority: FilterPriority;
  onFilterPriorityChange: (v: FilterPriority) => void;
  filterDueDate: FilterDueDate;
  onFilterDueDateChange: (v: FilterDueDate) => void;
  filterTag: string;
  onFilterTagChange: (v: string) => void;
  allTags: string[];
}

function Dropdown({ label, value, options, onChange, icon: Icon }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  icon: typeof Filter;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = options.find(o => o.value === value);
  const isActive = value !== options[0]?.value;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-all ${
          isActive
            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
        }`}
      >
        <Icon size={13} />
        <span className="hidden sm:inline">{label}:</span>
        <span className="font-semibold">{selected?.label}</span>
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50 min-w-[150px]">
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                opt.value === value ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SearchFilter({
  search, onSearchChange,
  sortBy, onSortChange,
  filterPriority, onFilterPriorityChange,
  filterDueDate, onFilterDueDateChange,
  filterTag, onFilterTagChange,
  allTags,
}: SearchFilterProps) {
  const hasFilters = filterPriority !== 'all' || filterDueDate !== 'all' || filterTag !== '';

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search tasks..."
          className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none transition-all bg-white text-gray-800 placeholder:text-gray-400"
        />
        {search && (
          <button onClick={() => onSearchChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Sort */}
      <Dropdown
        label="Sort"
        value={sortBy}
        icon={SortAsc}
        options={[
          { value: 'created', label: 'Date Created' },
          { value: 'dueDate', label: 'Due Date' },
          { value: 'priority', label: 'Priority' },
        ]}
        onChange={v => onSortChange(v as SortOption)}
      />

      {/* Priority Filter */}
      <Dropdown
        label="Priority"
        value={filterPriority}
        icon={Filter}
        options={[
          { value: 'all', label: 'All' },
          { value: 'high', label: 'High' },
          { value: 'medium', label: 'Medium' },
          { value: 'low', label: 'Low' },
        ]}
        onChange={v => onFilterPriorityChange(v as FilterPriority)}
      />

      {/* Due Date Filter */}
      <Dropdown
        label="Due"
        value={filterDueDate}
        icon={Filter}
        options={[
          { value: 'all', label: 'All' },
          { value: 'overdue', label: 'Overdue' },
          { value: 'today', label: 'Today' },
          { value: 'this-week', label: 'This Week' },
          { value: 'no-date', label: 'No Date' },
        ]}
        onChange={v => onFilterDueDateChange(v as FilterDueDate)}
      />

      {/* Tag Filter */}
      {allTags.length > 0 && (
        <Dropdown
          label="Tag"
          value={filterTag}
          icon={Filter}
          options={[
            { value: '', label: 'All' },
            ...allTags.map(t => ({ value: t, label: t })),
          ]}
          onChange={onFilterTagChange}
        />
      )}

      {/* Clear Filters */}
      {hasFilters && (
        <button
          onClick={() => {
            onFilterPriorityChange('all');
            onFilterDueDateChange('all');
            onFilterTagChange('');
          }}
          className="flex items-center gap-1 px-3 py-2 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
        >
          <X size={12} />
          Clear
        </button>
      )}
    </div>
  );
}
