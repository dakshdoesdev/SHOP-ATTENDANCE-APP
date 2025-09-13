import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Clock } from "lucide-react";

type Props = {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

function parse(value?: string): { h: number; m: number } {
  if (!value) return { h: 9, m: 0 };
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(value);
  if (!m) return { h: 9, m: 0 };
  const h = Math.max(0, Math.min(23, parseInt(m[1], 10)));
  const mm = Math.max(0, Math.min(59, parseInt(m[2], 10)));
  return { h, m: mm };
}

export function TimePicker({ value, onChange, placeholder = "HH:MM", className }: Props) {
  const { h } = useMemo(() => parse(value), [value]);
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

  function setHour(hour: number) {
    onChange(`${pad2(hour)}:00`);
  }

  function setPreset(v: string) {
    const { h } = parse(v);
    onChange(`${pad2(h)}:00`);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("w-36 justify-between font-mono", className)}>
          <span>{value ? value : placeholder}</span>
          <Clock className="h-4 w-4 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px]">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Clock className="h-4 w-4" /> Set Time
          <span className="ml-auto font-mono text-muted-foreground">{pad2(h)}:00</span>
        </div>
        <div>
          <div className="mb-1 text-xs text-muted-foreground">Hour</div>
          <div className="grid max-h-56 grid-cols-6 gap-1 overflow-auto pr-1">
            {hours.map((hour) => (
              <button
                key={hour}
                type="button"
                onClick={() => setHour(hour)}
                className={cn(
                  "h-8 rounded-md text-sm hover:bg-muted",
                  "border",
                  hour === h ? "bg-primary text-primary-foreground border-primary" : "border-transparent"
                )}
              >
                {pad2(hour)}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            Presets:
            <button className="rounded border px-2 py-1 hover:bg-muted" onClick={() => setPreset("09:00")}>09:00</button>
            <button className="rounded border px-2 py-1 hover:bg-muted" onClick={() => setPreset("17:00")}>17:00</button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onChange("")}>Clear</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default TimePicker;
