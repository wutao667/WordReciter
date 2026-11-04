import assert from 'node:assert/strict';
import handler, { DEFAULT_MAX_TOKENS, DEFAULT_TIMEOUT_MS } from '../api/ocr.ts';

const originalFetch = globalThis.fetch;
const managedEnv = [
  'OPENCODE_API_KEY',
  'GEM_API_KEY',
  'OPENCODE_BASE_URL',
  'OPENCODE_MODEL',
  'OPENCODE_MAX_TOKENS',
  'OPENCODE_CONTEXT_WINDOW',
  'OPENCODE_TIMEOUT_MS',
  'OPENCODE_REASONING_EFFORT',
];
const originalEnv = Object.fromEntries(managedEnv.map((name) => [name, process.env[name]]));

const resetEnv = () => {
  for (const name of managedEnv) delete process.env[name];
  process.env.OPENCODE_API_KEY = 'super-secret-test-key';
};

// handler 已从 Edge runtime 改为 Node runtime（maxDuration 才对 Edge 之外生效），
// 因此这里用 (req, res) 的 Node 形态调用，而不是 Request/Response。
const invoke = async (payload, method = 'POST') => {
  const req = {
    method,
    body: JSON.stringify(payload),
  };
  let statusCode = 200;
  const headers = {};
  let raw = '';
  const res = {
    set statusCode(value) { statusCode = value; },
    get statusCode() { return statusCode; },
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
    end(chunk) { raw = chunk ?? ''; },
  };

  await handler(req, res);

  let body;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = raw;
  }
  return { status: statusCode, body, headers };
};

// 模拟非 POST 请求：handler 只检查 method，不读 body
const invokeMethod = async (method) => {
  const req = { method, body: undefined };
  let statusCode = 200;
  let raw = '';
  const res = {
    set statusCode(value) { statusCode = value; },
    get statusCode() { return statusCode; },
    setHeader() {},
    end(chunk) { raw = chunk ?? ''; },
  };
  await handler(req, res);
  return { status: statusCode, body: raw ? JSON.parse(raw) : null };
};

const okResponse = (body = {
  choices: [{ message: { content: 'apple\nbanana', reasoning_content: 'private analysis' } }],
}) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('OCR request builds one JPEG data URL and the expected non-streaming body', async () => {
  let upstream;
  globalThis.fetch = async (_url, init) => {
    upstream = init;
    return okResponse();
  };

  const result = await invoke({ image: 'QUJD', languages: ['en'] });
  const body = JSON.parse(upstream.body);
  const imagePart = body.messages[1].content.find((part) => part.type === 'image_url');

  assert.equal(imagePart.image_url.url, 'data:image/jpeg;base64,QUJD');
  assert.equal((imagePart.image_url.url.match(/data:image\/jpeg;base64,/g) || []).length, 1);
  assert.equal(body.model, 'deepseek-v4.1-flash');
  assert.equal(body.max_tokens, 16000);
  assert.equal(body.context_window, 1048576);
  assert.equal(body.stream, false);
  assert.equal(upstream.headers['x-opencode-session'], 'wordreciter-ocr');
  assert.equal(result.status, 200);
});

test('success response preserves the frontend contract and excludes reasoning_content', async () => {
  globalThis.fetch = async () => okResponse();
  const result = await invoke({ image: 'QUJD' });
  assert.deepEqual(result.body, {
    success: true,
    choices: [{ message: { content: 'apple\nbanana' } }],
  });
  assert.equal(JSON.stringify(result.body).includes('private analysis'), false);
});

test('an already-prefixed input is normalized without a double prefix', async () => {
  let url;
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(init.body);
    url = body.messages[1].content.find((part) => part.type === 'image_url').image_url.url;
    return okResponse();
  };
  await invoke({ image: 'data:image/png;base64,QUJD' });
  assert.equal(url, 'data:image/png;base64,QUJD');
});

test('unsupported image data URL returns JSON 400 without calling upstream', async () => {
  globalThis.fetch = async () => assert.fail('fetch must not be called');
  const result = await invoke({ image: 'data:image/gif;base64,QUJD' });
  assert.equal(result.status, 400);
  assert.equal(result.headers['content-type'], 'application/json');
  assert.match(result.body.error, /JPEG、PNG 或 WebP/);
});

test('reasoning_effort is absent unless explicitly configured', async () => {
  let upstreamBody;
  globalThis.fetch = async (_url, init) => {
    upstreamBody = JSON.parse(init.body);
    return okResponse();
  };
  await invoke({ image: 'QUJD' });
  assert.equal(Object.hasOwn(upstreamBody, 'reasoning_effort'), false);
});

test('configured reasoning_effort is sent upstream', async () => {
  process.env.OPENCODE_REASONING_EFFORT = 'low';
  let upstreamBody;
  globalThis.fetch = async (_url, init) => {
    upstreamBody = JSON.parse(init.body);
    return okResponse();
  };
  await invoke({ image: 'QUJD' });
  assert.equal(upstreamBody.reasoning_effort, 'low');
});

test('an upstream 400 retries once without reasoning_effort and succeeds', async () => {
  process.env.OPENCODE_REASONING_EFFORT = 'low';
  const attempts = [];
  globalThis.fetch = async (_url, init) => {
    attempts.push(JSON.parse(init.body));
    return attempts.length === 1
      ? new Response('unsupported field', { status: 400 })
      : okResponse();
  };
  const result = await invoke({ image: 'QUJD' });
  assert.equal(result.status, 200);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].reasoning_effort, 'low');
  assert.equal(Object.hasOwn(attempts[1], 'reasoning_effort'), false);
});

test("type:'test' sends text only and reports the configured model", async () => {
  let upstreamBody;
  globalThis.fetch = async (_url, init) => {
    upstreamBody = JSON.parse(init.body);
    return okResponse();
  };
  const result = await invoke({ type: 'test' });
  assert.equal(JSON.stringify(upstreamBody).includes('image_url'), false);
  assert.equal(upstreamBody.messages[1].content, 'ping');
  assert.equal(result.status, 200);
  assert.match(result.body.message, /deepseek-v4\.1-flash/);
});

test('missing image returns 400 without calling upstream', async () => {
  delete process.env.OPENCODE_API_KEY;
  delete process.env.GEM_API_KEY;
  globalThis.fetch = async () => assert.fail('fetch must not be called');
  const result = await invoke({ type: 'ocr', image: '  ' });
  assert.equal(result.status, 400);
  assert.equal(result.body.success, false);
});

test('oversized image payload returns 413 before hitting upstream', async () => {
  globalThis.fetch = async () => assert.fail('fetch must not be called');
  const result = await invoke({ image: 'A'.repeat(4 * 1024 * 1024 + 1) });
  assert.equal(result.status, 413);
  assert.equal(result.body.success, false);
});

test('missing both key names returns 500 and names both variables', async () => {
  delete process.env.OPENCODE_API_KEY;
  delete process.env.GEM_API_KEY;
  globalThis.fetch = async () => assert.fail('fetch must not be called');
  const result = await invoke({ image: 'QUJD' });
  assert.equal(result.status, 500);
  assert.match(result.body.error, /OPENCODE_API_KEY/);
  assert.match(result.body.error, /GEM_API_KEY/);
});

test('legacy GEM_API_KEY remains a working fallback', async () => {
  delete process.env.OPENCODE_API_KEY;
  process.env.GEM_API_KEY = 'legacy-secret-key';
  let authorization;
  globalThis.fetch = async (_url, init) => {
    authorization = init.headers.Authorization;
    return okResponse();
  };
  const result = await invoke({ image: 'QUJD' });
  assert.equal(result.status, 200);
  assert.equal(authorization, 'Bearer legacy-secret-key');
});

test('non-POST methods are rejected with 405', async () => {
  globalThis.fetch = async () => assert.fail('fetch must not be called');
  const result = await invokeMethod('GET');
  assert.equal(result.status, 405);
  assert.equal(result.body.success, false);
});

for (const [upstreamStatus, expectedStatus] of [[401, 502], [429, 429]]) {
  test(`upstream ${upstreamStatus} maps to ${expectedStatus} without leaking a key`, async () => {
    globalThis.fetch = async () => new Response('upstream failure', { status: upstreamStatus });
    const result = await invoke({ image: 'QUJD' });
    assert.equal(result.status, expectedStatus);
    assert.equal(result.body.success, false);
    assert.equal(JSON.stringify(result.body).includes('super-secret-test-key'), false);
  });
}

test('image-related upstream 422 gives the visual-capability error', async () => {
  globalThis.fetch = async () => new Response('unsupported image', { status: 422 });
  const result = await invoke({ image: 'QUJD' });
  assert.equal(result.status, 502);
  assert.match(result.body.error, /当前模型可能不支持图片输入/);
});

test('empty content with finish_reason=length reports budget exhaustion, not empty image', async () => {
  globalThis.fetch = async () => okResponse({
    choices: [{ message: { content: '' }, finish_reason: 'length' }],
  });
  const result = await invoke({ image: 'QUJD' });
  assert.equal(result.status, 502);
  assert.equal(result.body.success, false);
  assert.match(result.body.error, /推理占满/);
  assert.doesNotMatch(result.body.error, /未识别到/);
});

test('non-empty content with finish_reason=length is rejected instead of returning a partial list', async () => {
  globalThis.fetch = async () => okResponse({
    choices: [{ message: { content: 'apple\nbanana' }, finish_reason: 'length' }],
  });
  const result = await invoke({ image: 'QUJD' });
  assert.equal(result.status, 502);
  assert.equal(result.body.success, false);
  assert.match(result.body.error, /不完整/);
});

test('defaults cap generation at 16k and leave 15 seconds before the Vercel deadline', () => {
  assert.equal(DEFAULT_MAX_TOKENS, 16000);
  assert.equal(DEFAULT_TIMEOUT_MS, 45000);
  assert.equal(60_000 - DEFAULT_TIMEOUT_MS, 15_000);
});

test('an oversized timeout override is capped at the 45-second safety deadline', async () => {
  process.env.OPENCODE_TIMEOUT_MS = '55000';
  const originalSetTimeout = globalThis.setTimeout;
  let scheduledDelay;
  globalThis.setTimeout = (callback, delay, ...args) => {
    scheduledDelay = delay;
    return originalSetTimeout(callback, delay, ...args);
  };
  globalThis.fetch = async () => okResponse();
  try {
    const result = await invoke({ image: 'QUJD' });
    assert.equal(result.status, 200);
    assert.equal(scheduledDelay, 45000);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('a malformed successful upstream response returns a useful JSON error', async () => {
  globalThis.fetch = async () => okResponse({ choices: [] });
  const result = await invoke({ image: 'QUJD' });
  assert.equal(result.status, 502);
  assert.equal(result.body.success, false);
  assert.match(result.body.error, /格式异常/);
});

test('timeout aborts upstream and maps to 504', async () => {
  process.env.OPENCODE_TIMEOUT_MS = '5';
  globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
  const result = await invoke({ image: 'QUJD' });
  assert.equal(result.status, 504);
  assert.equal(result.headers['content-type'], 'application/json');
  assert.equal(result.body.success, false);
  assert.match(result.body.error, /图片|重试/);
});

let passed = 0;
try {
  for (const { name, fn } of tests) {
    resetEnv();
    await fn();
    passed += 1;
    console.log(`ok ${passed} - ${name}`);
  }
  console.log(`\n${passed} OCR proxy mock tests passed.`);
} finally {
  globalThis.fetch = originalFetch;
  for (const name of managedEnv) {
    const value = originalEnv[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}
