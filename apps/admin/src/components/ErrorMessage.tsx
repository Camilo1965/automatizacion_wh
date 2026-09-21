import { Alert, AlertDescription } from '@/components/ui/alert';

type ErrorMessageProps = {
  message: string;
  id?: string;
};

export function ErrorMessage({
  message,
  id = 'form-error',
}: ErrorMessageProps) {
  if (message.trim() === '') {
    return null;
  }

  return (
    <Alert
      id={id}
      variant="destructive"
      role="alert"
      aria-live="assertive"
      className="rounded-[1.125rem]"
    >
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
