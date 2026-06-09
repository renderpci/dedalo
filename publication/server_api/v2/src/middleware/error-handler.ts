import { HttpError, ServiceError } from '../errors';
import { json } from '../utils/response';
import { isDevelopment } from '../config';

export function handleError(error: unknown): Response {
  if (error instanceof ServiceError) {
    return json({
      error: error.message,
      status: error.statusCode,
      code: error.code,
    }, error.statusCode);
  }

  if (error instanceof HttpError) {
    return json({
      error: error.message,
      status: error.status,
    }, error.status);
  }

  if (error instanceof Error) {
    console.error('Unhandled error:', error.message);
    return json({
      error: isDevelopment ? error.message : 'Internal server error',
      status: 500,
    }, 500);
  }

  console.error('Unknown error:', error);
  return json({
    error: 'Internal server error',
    status: 500,
  }, 500);
}
