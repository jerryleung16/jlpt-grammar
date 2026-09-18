import type { Request, Response, NextFunction } from 'express';

function allowedOrigins() {
  return new Set(
    [process.env.FRONTEND_URL, process.env.API_PUBLIC_URL, process.env.CORS_ORIGINS, 'http://localhost:3000']
      .filter(Boolean)
      .flatMap((value) => value!.split(','))
      .map((value) => value.trim())
      .map((value) => {
        try {
          return new URL(value).origin;
        } catch {
          return value.replace(/\/$/, '');
        }
      }),
  );
}

export function corsHeaders(request: Request, response: Response, next: NextFunction) {
  const origin = request.headers.origin;
  if (origin && allowedOrigins().has(origin.replace(/\/$/, ''))) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    response.setHeader('Vary', 'Origin');
  }
  if (request.method === 'OPTIONS') {
    response.status(204).end();
    return;
  }
  next();
}
