export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const target = new URL(url.pathname + url.search, env.WORKER_URL);
  const init = { method: request.method, headers: request.headers };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }
  return fetch(new Request(target.toString(), init));
}
