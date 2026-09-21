import { Button } from '../components/Button';
import { Textarea } from '@/components/ui/textarea';

export function MessageComposer({
  enabled,
  pending,
  text,
  onTextChange,
  onSend,
}: {
  enabled: boolean;
  pending: boolean;
  text: string;
  onTextChange: (text: string) => void;
  onSend: (text: string) => Promise<void>;
}) {
  return (
    <form
      className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        const value = text.trim();
        if (!value) return;
        void onSend(value).catch(() => undefined);
      }}
    >
      <label className="sr-only" htmlFor="whatsapp-reply">
        Responder por WhatsApp
      </label>
      <Textarea
        id="whatsapp-reply"
        className="min-h-20 flex-1 rounded-[1.125rem] bg-muted"
        disabled={!enabled || pending}
        onChange={(event) => onTextChange(event.target.value)}
        placeholder={
          enabled ? 'Escribe una respuesta…' : 'Toma el control para responder'
        }
        value={text}
      />
      <Button
        disabled={!enabled || pending || text.trim() === ''}
        loading={pending}
        type="submit"
      >
        Enviar mensaje
      </Button>
    </form>
  );
}
