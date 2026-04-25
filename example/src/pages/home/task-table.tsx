import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type SortingState,
} from '@tanstack/react-table';

import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Plus,
  Trash2,
  RotateCcw,
  Play,
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  Pencil,
  Square,
  Send,
  History,
  EyeOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useCallback, useEffect, useMemo, useState, useRef, memo } from 'react';
import StatStatus from '@/components/common/stat-status';
import type { Task } from 'kernel-script';
import { useTaskWorker } from '@/hooks/use-task-worker';

const TaskRow = memo(
  function TaskRow({ row, isSelected }: { row: Row<Task>; isSelected: boolean }) {
    return (
      <TableRow
        data-state={isSelected && 'selected'}
        className={cn(
          'transition-colors group relative',
          isSelected ? 'bg-primary/5' : 'hover:bg-muted/30'
        )}
      >
        {row.getVisibleCells().map((cell) => (
          <TableCell key={cell.id} className="p-4 align-top border-none">
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        ))}
      </TableRow>
    );
  },
  (prev, next) => {
    return prev.isSelected === next.isSelected && prev.row.original === next.row.original;
  }
);

function DelayCountdown({ delayUntil }: { delayUntil: number }) {
  const [remaining, setRemaining] = useState(
    Math.max(0, Math.ceil((delayUntil - Date.now()) / 1000))
  );

  useEffect(() => {
    const interval = setInterval(() => {
      const newRemaining = Math.max(0, Math.ceil((delayUntil - Date.now()) / 1000));
      setRemaining(newRemaining);
      if (newRemaining <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [delayUntil]);

  if (remaining <= 0) return null;

  return (
    <div className="text-[9px] font-bold text-sky-500/70 animate-pulse">
      Bắt đầu sau {remaining}s...
    </div>
  );
}

export function TaskTable() {
  const worker = useTaskWorker();

  const tasks = useMemo(() => {
    const seen = new Set<string>();
    return worker.tasks.filter((t: Task) => {
      if (!t.id || seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
  }, [worker.tasks]);

  const [sorting, setSorting] = useState<SortingState>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Derive rowSelection directly from store selectedIds to avoid double-renders
  const rowSelection = useMemo(() => {
    const selection: Record<string, boolean> = {};
    for (const id of worker.selectedIds) {
      selection[id] = true;
    }
    return selection;
  }, [worker.selectedIds]);

  const handleAddRow = useCallback(() => {
    worker.createTask({
      name: `Task ${tasks.length + 1}`,
      payload: {
        model: 'config.model',
        ratio: ' config.ratio',
        references: [],
        prompt: '',
      },
    });

    setTimeout(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({
          top: scrollContainerRef.current.scrollHeight,
          behavior: 'smooth',
        });
      }
    }, 100);
  }, [tasks.length, worker]);

  const handleDeleteSelected = useCallback(async () => {
    await worker.deleteTasks(worker.selectedIds);
    toast.success(`Deleted ${worker.selectedIds.length} task(s)`);
  }, [worker]);

  const handleToggleFlagSelected = useCallback(async () => {
    const selectedTasks = tasks.filter((t: Task) => worker.selectedIds.includes(t.id));
    const allSkipped = selectedTasks.every((t: Task) => t.status === 'Skipped');

    if (allSkipped) {
      toast.success(`Unflagged ${worker.selectedIds.length} task(s)`);
    } else {
      await worker.unpublishTasks(worker.selectedIds);
      toast.success(`Skipped ${worker.selectedIds.length} task(s)`);
    }
  }, [worker, tasks]);

  const handleResetSelected = useCallback(() => {
    toast.success(`Reset ${worker.selectedIds.length} task(s)`);
  }, [worker]);

  const handleStartOrStopTasks = useCallback(async () => {
    if (!worker.isRunning) {
      const waitingTasks = tasks.filter((t: Task) => t.status === 'Waiting');
      if (waitingTasks.length > 0) await worker.queueStart();
    } else {
      await worker.queueStop();
    }
  }, [worker, tasks]);

  const handlePublishTasks = useCallback(async () => {
    const draftTasks = tasks.filter(
      (t: Task) => t.status === 'Draft' && worker.selectedIds.includes(t.id)
    );
    await worker.publishTasks(draftTasks.map((t) => t.id));
    worker.toggleSelectAll(worker.selectedIds);

    toast.success(`Published ${draftTasks.length} task(s)`);
  }, [worker, tasks]);

  const stats = useMemo(() => {
    const counts = {
      Draft: 0,
      Waiting: 0,
      Running: 0,
      Completed: 0,
      Error: 0,
      Previous: 0,
      Skipped: 0,
    };
    tasks.forEach((t: Task) => {
      if (counts[t.status as keyof typeof counts] !== undefined) {
        counts[t.status as keyof typeof counts]++;
      }
    });
    return counts;
  }, [tasks]);

  const columns = useMemo<ColumnDef<Task>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => {
          const isAllSelected = table.getIsAllPageRowsSelected();
          const isIndeterminate = table.getIsSomePageRowsSelected() && !isAllSelected;

          return (
            <div className="flex items-center justify-center">
              <Checkbox
                checked={isAllSelected || (isIndeterminate ? 'indeterminate' : false)}
                onCheckedChange={() => {
                  // Toggle selection for all FILTERED tasks
                  const filteredIds = table.getFilteredRowModel().rows.map((r) => r.original.id);
                  worker.toggleSelectAll(filteredIds);
                }}
                aria-label="Select all"
                className="border-primary/40 hover:border-primary/60 data-[state=checked]:bg-primary data-[state=checked]:border-primary transition-colors cursor-pointer"
              />
            </div>
          );
        },
        cell: ({ row }) => (
          <div className="flex items-center justify-center">
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={() => worker.toggleSelect(row.original.id)}
              aria-label="Select row"
              className="border-primary/40 hover:border-primary/60 data-[state=checked]:bg-primary data-[state=checked]:border-primary transition-colors cursor-pointer"
            />
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
        size: 48,
      },
      {
        accessorKey: 'no',
        header: () => (
          <div className="text-center font-black uppercase tracking-widest text-[9px] text-muted-foreground">
            No.
          </div>
        ),
        cell: ({ row }) => (
          <div className="text-center text-[10px] font-bold text-muted-foreground/60">
            {row.original.no}
          </div>
        ),
        size: 64,
      },
      {
        id: 'task',
        header: () => (
          <div className="font-black uppercase tracking-widest text-[9px] text-muted-foreground">
            Task
          </div>
        ),
        cell: ({ row }) => (
          <div className="flex flex-col gap-1 py-1">
            <div>{row.original.name}</div>
            <span className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-tighter truncate w-full">
              {row.original.payload.model} | {row.original.payload.ratio}
            </span>
          </div>
        ),
        size: 180,
      },

      {
        id: 'progress',
        header: () => (
          <div className="text-center font-black uppercase tracking-widest text-[9px] text-muted-foreground">
            Status
          </div>
        ),
        cell: ({ row }) => (
          <div className="flex flex-col items-center justify-center gap-2.5 py-1">
            <Badge
              variant="outline"
              className={cn(
                'px-2 py-0.5 text-[9px] font-black uppercase tracking-widest border-none transition-all',
                row.original.status === 'Completed' &&
                  'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20',
                row.original.status === 'Running' &&
                  'bg-sky-500/10 text-sky-500 animate-pulse hover:bg-sky-500/20',
                row.original.status === 'Waiting' &&
                  'bg-muted text-muted-foreground hover:bg-muted/80',
                row.original.status === 'Error' &&
                  'bg-destructive/10 text-destructive hover:bg-destructive/20',
                row.original.status === 'Previous' &&
                  'bg-muted/50 text-muted-foreground/60 hover:bg-muted',
                row.original.status === 'Draft' &&
                  'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20',
                row.original.status === 'Skipped' &&
                  'bg-muted/30 text-muted-foreground/40 hover:bg-muted/50'
              )}
            >
              {row.original.status === 'Previous' ? (
                <div className="flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />
                  <span>Previous mission</span>
                </div>
              ) : row.original.delayUntil && row.original.delayUntil > Date.now() ? (
                <div className="flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5 animate-pulse" />
                  <span>Waiting...</span>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  {row.original.status === 'Completed' && <CheckCircle2 className="w-2.5 h-2.5" />}
                  {row.original.status === 'Running' && (
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  )}
                  {row.original.status === 'Error' && (
                    <AlertCircle
                      className="w-2.5 h-2.5 cursor-pointer"
                      onClick={() => toast.error(row.original.errorMessage || 'Unknown error')}
                    />
                  )}
                  {row.original.status === 'Skipped' && <EyeOff className="w-2.5 h-2.5" />}
                  <span>{row.original.status}</span>
                </div>
              )}
            </Badge>
            {row.original.delayUntil && row.original.delayUntil > Date.now() && (
              <DelayCountdown delayUntil={row.original.delayUntil} />
            )}
            <div className="flex gap-2">
              {(row.original.status === 'Error' ||
                row.original.status === 'Completed' ||
                row.original.status === 'Skipped') && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="w-7 h-7 rounded-lg transition-all shadow-sm hover:bg-amber-500/10 hover:text-amber-500"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Reset to Draft - needs backend support
                  }}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </Button>
              )}
              <Button
                size="icon"
                variant={
                  ['Waiting', 'Running'].includes(row.original.status) ? 'ghost' : 'secondary'
                }
                disabled={true}
                className={cn(
                  'w-7 h-7 rounded-lg transition-all shadow-sm',
                  ['Waiting', 'Running'].includes(row.original.status) &&
                    'text-destructive hover:bg-destructive/10 hover:text-destructive'
                )}
                onClick={async (e) => {
                  e.stopPropagation();
                  if (row.original.status === 'Waiting' || row.original.status === 'Running') {
                    toast.success(`Stopped task ${row.original.name}`);
                  } else {
                    toast.success(`Started task ${row.original.name}`);
                  }
                }}
              >
                {false ? (
                  <Square className="w-3 h-3 fill-current" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
              </Button>
            </div>
          </div>
        ),
        size: 140,
      },
    ],
    [worker.toggleSelect, worker.toggleSelectAll, worker.isRunning]
  );

  const table = useReactTable({
    data: tasks,
    columns,
    state: {
      sorting,
      rowSelection,
      globalFilter: statusFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setStatusFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue: string) => {
      if (filterValue === 'all') return true;
      return row.original.status === filterValue;
    },
    getRowId: (row) => row.id,
    enableRowSelection: true,
  });

  useEffect(() => {
    console.log('tasks', tasks);
  }, [tasks]);

  return (
    <>
      <div className="flex-1 flex flex-col h-full min-h-0 bg-muted/10 relative overflow-hidden">
        {/* Background Glow */}
        <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-primary/5 blur-[120px] pointer-events-none" />

        <div className="flex-1 flex flex-col min-h-0 p-3 gap-3 overflow-hidden">
          {/* Stats Header */}
          <div className="shrink-0 flex items-center gap-2">
            <StatStatus
              icon={<Pencil className="w-4 h-4 text-amber-500" />}
              value={stats.Draft}
              label="Drafts"
              onClick={() => setStatusFilter(statusFilter === 'Draft' ? 'all' : 'Draft')}
              isActive={statusFilter === 'Draft'}
              variant="amber"
            />
            <StatStatus
              icon={<Clock className="w-4 h-4 text-muted-foreground" />}
              value={stats.Waiting}
              label="Waiting"
              onClick={() => setStatusFilter(statusFilter === 'Waiting' ? 'all' : 'Waiting')}
              isActive={statusFilter === 'Waiting'}
              variant="muted"
            />
            <StatStatus
              icon={<Loader2 className="w-4 h-4 text-sky-500 animate-spin" />}
              value={stats.Running}
              label="Running"
              onClick={() => setStatusFilter(statusFilter === 'Running' ? 'all' : 'Running')}
              isActive={statusFilter === 'Running'}
              variant="sky"
            />
            <StatStatus
              icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
              value={stats.Completed}
              label="Completed"
              onClick={() => setStatusFilter(statusFilter === 'Completed' ? 'all' : 'Completed')}
              isActive={statusFilter === 'Completed'}
              variant="emerald"
            />
            <StatStatus
              icon={<AlertCircle className="w-4 h-4 text-destructive" />}
              value={stats.Error}
              label="Errors"
              onClick={() => setStatusFilter(statusFilter === 'Error' ? 'all' : 'Error')}
              isActive={statusFilter === 'Error'}
              variant="destructive"
            />
            <StatStatus
              icon={<History className="w-4 h-4 text-muted-foreground/60" />}
              value={stats.Previous}
              label="Previous"
              onClick={() => setStatusFilter(statusFilter === 'Previous' ? 'all' : 'Previous')}
              isActive={statusFilter === 'Previous'}
              variant="muted"
            />
            <StatStatus
              icon={<EyeOff className="w-4 h-4 text-muted-foreground/40" />}
              value={stats.Skipped}
              label="Skipped"
              onClick={() => setStatusFilter(statusFilter === 'Skipped' ? 'all' : 'Skipped')}
              isActive={statusFilter === 'Skipped'}
              variant="muted"
            />

            <div className="ml-auto flex items-center gap-2">
              <div
                onClick={() => {}}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-background/50 border border-border/50 shadow-sm transition-all hover:border-primary/30 group cursor-pointer"
              >
                <div className="p-1.5 rounded-lg bg-muted/50 group-hover:bg-primary/10 transition-colors">
                  <History className="w-4 h-4 text-primary" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest leading-none mt-0.5">
                    History
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Table Section */}
          <div className="flex-1 min-h-0 bg-background/50 border border-border rounded-lg shadow-lg flex flex-col overflow-hidden">
            <div
              ref={scrollContainerRef}
              className="flex-1 overflow-auto relative custom-scrollbar"
            >
              <Table
                className="min-w-300 border-separate border-spacing-0"
                containerClassName="overflow-visible"
              >
                <TableHeader className="relative z-10">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow
                      key={headerGroup.id}
                      className="border-b border-border hover:bg-transparent"
                    >
                      {headerGroup.headers.map((header) => (
                        <TableHead
                          key={header.id}
                          className="sticky top-0 h-12 px-4 text-left align-middle bg-secondary/98 backdrop-blur-md border-b border-border shadow-sm whitespace-nowrap font-bold text-[11px] uppercase tracking-wider text-muted-foreground"
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody className="divide-y divide-border/50">
                  {table.getRowModel().rows.map((row) => (
                    <TaskRow key={row.id} row={row} isSelected={row.getIsSelected()} />
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="bg-secondary/95 border-t border-border p-1.5 flex items-center gap-1 shrink-0 backdrop-blur-xl">
            <Button
              onClick={handleAddRow}
              variant="outline"
              size="icon"
              className="h-8 w-8 border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-all"
            >
              <Plus className="w-4 h-4 text-muted-foreground" />
            </Button>

            <Button
              onClick={handleDeleteSelected}
              variant="ghost"
              size="icon"
              disabled={worker.selectedIds.length === 0}
              className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive transition-all disabled:opacity-30"
            >
              <Trash2 className="w-4 h-4" />
            </Button>

            <Button
              onClick={handleToggleFlagSelected}
              variant="ghost"
              size="icon"
              disabled={worker.selectedIds.length === 0}
              className={cn(
                'h-8 w-8 hover:bg-amber-500/10 hover:text-amber-500 transition-all disabled:opacity-30',
                tasks.some((t: Task) => worker.selectedIds.includes(t.id)) &&
                  'text-amber-500 bg-amber-500/5 hover:bg-amber-500/10'
              )}
            >
              <EyeOff
                className={cn(
                  'w-4 h-4',
                  tasks.some((t: Task) => worker.selectedIds.includes(t.id)) && 'fill-current'
                )}
              />
            </Button>

            <Button
              onClick={handleResetSelected}
              variant="ghost"
              size="icon"
              disabled={worker.selectedIds.length === 0}
              className="h-8 w-8 hover:bg-amber-500/10 hover:text-amber-500 transition-all disabled:opacity-30"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>

            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-500/30 to-amber-400/10 blur-[2px] opacity-20 group-hover:opacity-40 transition duration-1000 pointer-events-none" />
              <Button
                onClick={handlePublishTasks}
                variant="default"
                disabled={
                  worker.selectedIds.filter(
                    (id: string) => tasks.find((t: Task) => t.id === id)?.status === 'Draft'
                  ).length === 0
                }
                className="relative h-8 font-black text-[10px] uppercase tracking-widest gap-1.5 px-4 shadow-lg shadow-amber-500/20 transition-all bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 hover:shadow-amber-500/40 hover:scale-[1.02]"
              >
                <Send className="w-3 h-3" />
                Publish
              </Button>
            </div>
            <div className="relative group">
              <Button
                onClick={handleStartOrStopTasks}
                disabled={
                  tasks.filter((t: Task) => ['Waiting', 'Running'].includes(t.status)).length === 0
                }
                variant="default"
                className="relative h-8 font-black text-[10px] uppercase tracking-widest gap-1.5 px-4 shadow-lg shadow-primary/20 transition-all hover:shadow-primary/40 hover:scale-[1.02]"
              >
                {worker.isRunning ? (
                  <>
                    <Square className="w-3 h-3 fill-current" />
                    Stop
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3 fill-current" />
                    Start
                  </>
                )}
              </Button>
            </div>

            {/* Performance Controls (Right Side) */}
            <div className="ml-auto flex items-center gap-4 px-3 py-1 bg-background/40 border border-border/50 rounded-lg backdrop-blur-sm mr-1">
              <div className="flex flex-col gap-0.5 min-w-[100px]">
                <div className="flex items-center justify-between px-0.5">
                  <Label className="text-[8px] font-black uppercase tracking-tighter text-muted-foreground/60 flex items-center gap-1">
                    <Zap className="w-2.5 h-2.5 text-primary" /> Threads
                  </Label>
                  <span className="text-[9px] font-black text-primary">
                    {worker.taskConfig.threads}
                  </span>
                </div>
                <Slider
                  value={[worker.taskConfig.threads]}
                  onValueChange={([val]) =>
                    worker.setTaskConfig({ ...worker.taskConfig, threads: val })
                  }
                  min={1}
                  max={4}
                  step={1}
                  className="h-3"
                />
              </div>

              <div className="h-6 w-px bg-border/30" />

              <div className="flex flex-col gap-0.5 min-w-[120px]">
                <div className="flex items-center justify-between px-0.5">
                  <Label className="text-[8px] font-black uppercase tracking-tighter text-muted-foreground/60 flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5 text-primary" /> Delay
                  </Label>
                  <span className="text-[9px] font-black text-primary">
                    {worker.taskConfig.delayMin}s - {worker.taskConfig.delayMax}s
                  </span>
                </div>
                <Slider
                  value={[worker.taskConfig.delayMin, worker.taskConfig.delayMax]}
                  onValueChange={([valMin, valMax]) =>
                    worker.setTaskConfig({
                      ...worker.taskConfig,
                      delayMin: valMin,
                      delayMax: valMax,
                    })
                  }
                  min={0}
                  max={30}
                  step={1}
                  className="h-3"
                />
              </div>

              <div className="h-6 w-px bg-border/30" />

              <div className="flex flex-col gap-0.5 min-w-[100px]">
                <div className="flex items-center justify-between px-0.5">
                  <Label className="text-[8px] font-black uppercase tracking-tighter text-muted-foreground/60 flex items-center gap-1">
                    <AlertCircle className="w-2.5 h-2.5 text-destructive" /> Stop Lim
                  </Label>
                  <span className="text-[9px] font-black text-destructive">
                    {worker.taskConfig.stopOnErrorCount === 0
                      ? 'Off'
                      : worker.taskConfig.stopOnErrorCount}
                  </span>
                </div>
                <Slider
                  value={[worker.taskConfig.stopOnErrorCount || 0]}
                  onValueChange={([val]) =>
                    worker.setTaskConfig({ ...worker.taskConfig, stopOnErrorCount: val })
                  }
                  min={0}
                  max={20}
                  step={1}
                  className="h-3 [&_[role=slider]]:border-destructive"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
