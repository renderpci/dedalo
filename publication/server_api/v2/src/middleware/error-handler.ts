import { ZodError } from 'zod';
import { ApiError, ValidationError, ServiceError } from '../errors';
import { problem } from '../utils/response';
import { isDevelopment } from '../config';

function requestInstance(req: Request): string {
  try {
    const url = new URL(req.url);
    return url.pathname + url.search;
  } catch {
    return '';
  }
}

export function handleError(error: unknown, req: Request): Response {
  const instance = requestInstance(req);

  if (error instanceof ZodError) {
    const issues = error.issues.map(issue => ({
      pointer: issue.path.join('.'),
      message: issue.message,
    }));
    return problem(
      new ValidationError('One or more request parameters are invalid', { errors: issues }),
      instance,
    );
  }

  if (error instanceof ApiError) {
    if (error.status >= 500) {
      console.error(`${error.name}:`, error.detail);
    }
    return problem(error, instance);
  }

  if (error instanceof Error) {
    console.error('Unhandled error:', error.stack ?? error.message);
    return problem(
      new ServiceError(isDevelopment ? error.message : 'An unexpected error occurred'),
      instance,
    );
  }

  console.error('Unknown error:', error);
  return problem(new ServiceError('An unexpected error occurred'), instance);
}
