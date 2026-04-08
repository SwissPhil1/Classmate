"use client";

interface ExamCountdownProps {
  writtenDays: number;
  oralDays: number;
  week: number;
}

export function ExamCountdown({ writtenDays, oralDays, week }: ExamCountdownProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
            Écrit
          </p>
          <p className="text-2xl font-bold text-foreground mt-1">
            J-{writtenDays}
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
            Oral
          </p>
          <p className="text-2xl font-bold text-foreground mt-1">
            J-{oralDays}
          </p>
        </div>
      </div>
      <p className="text-center text-sm text-muted-foreground">
        Semaine {week} sur 16
      </p>
    </div>
  );
}
