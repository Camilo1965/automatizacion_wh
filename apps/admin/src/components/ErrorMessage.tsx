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
    <p id={id} className="error-message" role="alert" aria-live="assertive">
      {message}
    </p>
  );
}
