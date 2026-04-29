import { useState, useMemo } from "react";
import { format, isFuture, isPast, differenceInDays } from "date-fns";
import { Plus, Trash2, CalendarIcon, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { usePracticeClosures } from "@/hooks/usePracticeClosures";

export function PracticeClosuresManager() {
  const { closures, loading, addClosure, deleteClosure } = usePracticeClosures();
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [reason, setReason] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);

  const handleAdd = async () => {
    if (!startDate || !endDate) return;

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const success = await addClosure(
      start.toISOString(),
      end.toISOString(),
      reason
    );

    if (success) {
      setIsAddOpen(false);
      setStartDate(undefined);
      setEndDate(undefined);
      setReason("");
    }
  };

  // Categorize closures
  const { upcoming, past, current } = useMemo(() => {
    const now = new Date();
    const upcoming: any[] = [];
    const past: any[] = [];
    const current: any[] = [];

    closures.forEach((closure) => {
      const startDate = new Date(closure.starts_at);
      const endDate = new Date(closure.ends_at);

      if (isFuture(startDate)) {
        upcoming.push(closure);
      } else if (isPast(endDate)) {
        past.push(closure);
      } else {
        current.push(closure);
      }
    });

    return { upcoming, past, current };
  }, [closures]);

  const getClosureBadgeColor = (closure: any) => {
    const startDate = new Date(closure.starts_at);
    const endDate = new Date(closure.ends_at);

    if (isFuture(startDate)) return "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300";
    if (isPast(endDate)) return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400";
    return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
  };

  const getDaysUntil = (closure: any) => {
    const startDate = new Date(closure.starts_at);
    const days = differenceInDays(startDate, new Date());
    if (days === 0) return "Today";
    if (days === 1) return "Tomorrow";
    if (days > 1) return `In ${days} days`;
    return null;
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="bg-card rounded-lg border p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h3 className="font-semibold">Practice Closure Dates</h3>
        <Sheet open={isAddOpen} onOpenChange={setIsAddOpen}>
          <SheetTrigger asChild>
            <Button size="sm" className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Add Closure
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Add Closure Period</SheetTitle>
              <SheetDescription className="sr-only">
                Add a practice closure period for holidays or other closures
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !startDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "PPP") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>End Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !endDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, "PPP") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      initialFocus
                      disabled={(date) => startDate ? date < startDate : false}
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Reason (optional)</Label>
                <Input
                  placeholder="e.g., Christmas holidays, Staff training"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>

              <Button onClick={handleAdd} className="w-full" disabled={!startDate || !endDate}>
                Add Closure
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Summary Cards */}
      {(current.length > 0 || upcoming.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {/* Current Closure */}
          {current.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                  Currently Closed
                </span>
              </div>
              {current.map((closure) => (
                <div key={closure.id} className="text-sm text-amber-800 dark:text-amber-200">
                  Until {format(new Date(closure.ends_at), "MMM d")}
                  {closure.reason && <span className="text-xs ml-1">({closure.reason})</span>}
                </div>
              ))}
            </div>
          )}

          {/* Next Upcoming */}
          {upcoming.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <CalendarIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                  Next Closure
                </span>
              </div>
              <div className="text-sm text-blue-800 dark:text-blue-200">
                {format(new Date(upcoming[0].starts_at), "MMM d, yyyy")}
                <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  {getDaysUntil(upcoming[0])}
                  {upcoming[0].reason && ` • ${upcoming[0].reason}`}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upcoming Closures */}
      {upcoming.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Upcoming Closures</h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {upcoming.map((closure) => (
              <div key={closure.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getClosureBadgeColor(closure)}`}>
                      {getDaysUntil(closure)}
                    </span>
                  </div>
                  <p className="text-sm font-medium">
                    {format(new Date(closure.starts_at), "PPP")}
                    {new Date(closure.starts_at).toDateString() !== new Date(closure.ends_at).toDateString() &&
                      ` - ${format(new Date(closure.ends_at), "PPP")}`}
                  </p>
                  {closure.reason && <p className="text-xs text-muted-foreground mt-1">{closure.reason}</p>}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteClosure(closure.id)}
                  className="shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Past Closures */}
      {past.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Past Closures</h4>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {past.slice(0, 5).map((closure) => (
              <div key={closure.id} className="flex items-center justify-between p-2 border rounded-lg bg-muted/30">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(closure.starts_at), "PP")}
                    {new Date(closure.starts_at).toDateString() !== new Date(closure.ends_at).toDateString() &&
                      ` - ${format(new Date(closure.ends_at), "PP")}`}
                  </p>
                  {closure.reason && <p className="text-xs text-muted-foreground/70">{closure.reason}</p>}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteClosure(closure.id)}
                  className="shrink-0 h-6 w-6 p-0"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
            {past.length > 5 && (
              <p className="text-xs text-center text-muted-foreground py-1">
                +{past.length - 5} more past closures
              </p>
            )}
          </div>
        </div>
      )}

      {closures.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No closures scheduled</p>
      )}
    </div>
  );
}
