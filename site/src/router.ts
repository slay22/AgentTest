// A minimal path matcher. No server framework, matching the receiptScanner
// convention: the Worker's fetch handler is the router, and the route table is
// small enough that a dependency would cost more than it saves.

export interface RouteContext {
  request: Request;
  env: Env;
  url: URL;
  params: Record<string, string>;
}

export type Handler = (context: RouteContext) => Promise<Response> | Response;

interface Route {
  method: string;
  segments: string[];
  handler: Handler;
}

export interface Router {
  add(method: string, pattern: string, handler: Handler): Router;
  get(pattern: string, handler: Handler): Router;
  post(pattern: string, handler: Handler): Router;
  delete(pattern: string, handler: Handler): Router;
  handle(request: Request, env: Env): Promise<Response | null>;
}

export function createRouter(): Router {
  const routes: Route[] = [];

  function add(method: string, pattern: string, handler: Handler): Router {
    routes.push({
      method,
      segments: pattern.split('/').filter(Boolean),
      handler,
    });
    return router;
  }

  async function handle(request: Request, env: Env): Promise<Response | null> {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);

    // HEAD is GET without a body: a HEAD request must select the same route and
    // produce the same headers, including the draft guard. Matching it exactly
    // meant HEAD fell through to the asset fallback and 404'd every GET route,
    // which breaks link checkers and uptime probes. The runtime strips the body.
    const method = request.method === 'HEAD' ? 'GET' : request.method;

    for (const route of routes) {
      if (route.method !== method) continue;
      if (route.segments.length !== parts.length) continue;

      const params: Record<string, string> = {};
      let matched = true;
      for (let index = 0; index < route.segments.length; index++) {
        const segment = route.segments[index];
        if (segment.startsWith(':')) {
          params[segment.slice(1)] = decodeURIComponent(parts[index]);
        } else if (segment !== parts[index]) {
          matched = false;
          break;
        }
      }
      if (!matched) continue;

      return route.handler({ request, env, url, params });
    }

    return null;
  }

  const router: Router = { add, get: (p, h) => add('GET', p, h), post: (p, h) => add('POST', p, h), delete: (p, h) => add('DELETE', p, h), handle };
  return router;
}
