type ClosureGenerator = Readonly<{ generate(date: string): Promise<unknown> }>;

export class DailyClosureScheduler {
  private lastGeneratedDate: string | null = null;
  constructor(private readonly closures: ClosureGenerator) {}

  async tick(now: Date): Promise<void> {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Bogota',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(now)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    );
    const businessDate = `${parts.year}-${parts.month}-${parts.day}`;
    if (Number(parts.hour) < 19 || this.lastGeneratedDate === businessDate)
      return;
    await this.closures.generate(businessDate);
    this.lastGeneratedDate = businessDate;
  }
}
