export const runtime = 'nodejs';
export const maxDuration = 120;

const upstreamUrl =
  process.env.ADDRESS_TRANSFER_PROXY_URL?.trim() ||
  'https://bnb-address-transfer-checker.pages.dev/api/check-address';
const maxBodyBytes = 512 * 1024;

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > maxBodyBytes) {
    return json({ error: '上传内容过大' }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody || '{}');
  } catch {
    return json({ error: '请求内容不是有效 JSON' }, 400);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch(upstreamUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.text();
    return new Response(payload, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (cause) {
    return json(
      {
        error:
          cause instanceof Error && cause.name === 'AbortError'
            ? '地址查询超时，请稍后重试'
            : '地址转账查询服务暂时不可用',
      },
      502,
    );
  } finally {
    clearTimeout(timeout);
  }
}
