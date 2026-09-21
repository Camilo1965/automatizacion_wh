import { Button } from '../components/Button';

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
      className="message-composer"
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
      <textarea
        id="whatsapp-reply"
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
