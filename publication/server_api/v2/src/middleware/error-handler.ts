export function handleError(error: unknown): Response {
  console.error('Unhandled error:', error);

  const message = error instanceof Error ? error.message : 'Internal server error';
  const status = error instanceof Error && 'status' in error ? (error as any).status : 500;

  return new Response(
    JSON.stringify({
      error: message,
      status,
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
