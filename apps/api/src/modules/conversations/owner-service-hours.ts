type Settings = Readonly<{
  serviceHours?: Readonly<{
    days: readonly number[];
    start: string;
    end: string;
  }> | null;
}>;
export function ownerAvailabilityMessage(
  settings: Settings | null,
  now = new Date(),
): string {
  const hours = settings?.serviceHours;
  if (!hours) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
    values.weekday!,
  );
  const time = `${values.hour}:${values.minute}`;
  if (hours.days.includes(day) && time >= hours.start && time < hours.end)
    return '';
  const names = [
    'domingo',
    'lunes',
    'martes',
    'miércoles',
    'jueves',
    'viernes',
    'sábado',
  ];
  return `La atención de la propietaria es ${hours.days.map((value) => names[value]).join(', ')}, de ${hours.start} a ${hours.end}, hora de Colombia. Responderá en el siguiente horario de atención.`;
}
