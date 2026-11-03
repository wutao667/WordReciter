import assert from 'node:assert/strict';
import handler from '../api/ocr.ts';

const originalFetch = globalThis.fetch;
const managedEnv = [
  'OPENCODE_API_KEY',
  'GEM_API_KEY',
  'OPENCODE_BASE_URL',
  'OPENCODE_MODEL',
  'OPENCODE_MAX_TOKENS',
  'OPENCODE_CONTEXT_WINDOW',
  'OPENCODE_TIMEOUT_MS',
];
const originalEnv = Object.fromEntries(managedEnv.map((name) => [name, process.env[name]]));

const resetEnv = () => {
  for (const name of managedEnv) delete process.env[name];
  process.env.OPENCODE_API_KEY = 'super-secret-test-key';
};

const request = (body) => new Request('http://localhost/api/ocr', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const json = async (response) => ({
  status: response.status,
  body: await response.json(),
});

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

  const result = await json(await handler(request({ image: 'QUJD', languages: ['en'] })));
  const body = JSON.parse(upstream.body);
  const imagePart = body.messages[1].content.find((part) => part.type === 'image_url');

  assert.equal(imagePart.image_url.url, 'data:image/jpeg;base64,QUJD');
  assert.equal((imagePart.image_url.url.match(/data:image\/jpeg;base64,/g) || []).length, 1);
  assert.equal(body.model, 'deepseek-v4.1-flash');
  assert.equal(body.max_tokens, 2000);
  assert.equal(body.context_window, 1048576);
  assert.equal(body.stream, false);
  assert.equal(upstream.headers['x-opencode-session'], 'wordreciter-ocr');
  assert.equal(result.status, 200);
});

test('success response preserves the frontend contract and excludes reasoning_content', async () => {
  globalThis.fetch = async () => okResponse();
  const result = await json(await handler(request({ image: 'QUJD' })));
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
  await handler(request({ image: 'data:image/png;base64,QUJD' }));
  assert.equal(url, 'data:image/jpeg;base64,QUJD');
});

test("type:'test' sends text only and reports the configured model", async () => {
  let upstreamBody;
  globalThis.fetch = async (_url, init) => {
    upstreamBody = JSON.parse(init.body);
    return okResponse();
  };
  const result = await json(await handler(request({ type: 'test' })));
  assert.equal(JSON.stringify(upstreamBody).includes('image_url'), false);
  assert.equal(upstreamBody.messages[1].content, 'ping');
  assert.equal(result.status, 200);
  assert.match(result.body.message, /deepseek-v4\.1-flash/);
});

test('missing image returns 400 without calling upstream', async () => {
  delete process.env.OPENCODE_API_KEY;
  delete process.env.GEM_API_KEY;
  globalThis.fetch = async () => assert.fail('fetch must not be called');
  const result = await json(await handler(request({ type: 'ocr', image: '  ' })));
  assert.equal(result.status, 400);
  assert.equal(result.body.success, false);
});

test('missing both key names returns 500 and names both variables', async () => {
  delete process.env.OPENCODE_API_KEY;
  delete process.env.GEM_API_KEY;
  globalThis.fetch = async () => assert.fail('fetch must not be called');
  const result = await json(await handler(request({ image: 'QUJD' })));
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
  const result = await json(await handler(request({ image: 'QUJD' })));
  assert.equal(result.status, 200);
  assert.equal(authorization, 'Bearer legacy-secret-key');
});

for (const [upstreamStatus, expectedStatus] of [[401, 502], [429, 429]]) {
  test(`upstream ${upstreamStatus} maps to ${expectedStatus} without leaking a key`, async () => {
    globalThis.fetch = async () => new Response('upstream failure', { status: upstreamStatus });
    const result = await json(await handler(request({ image: 'QUJD' })));
    assert.equal(result.status, expectedStatus);
    assert.equal(result.body.success, false);
    assert.equal(JSON.stringify(result.body).includes('super-secret-test-key'), false);
  });
}

test('image-related upstream 422 gives the visual-capability error', async () => {
  globalThis.fetch = async () => new Response('unsupported image', { status: 422 });
  const result = await json(await handler(request({ image: 'QUJD' })));
  assert.equal(result.status, 502);
  assert.match(result.body.error, /当前模型可能不支持图片输入/);
});

test('timeout aborts upstream and maps to 504', async () => {
  process.env.OPENCODE_TIMEOUT_MS = '5';
  globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
  const result = await json(await handler(request({ image: 'QUJD' })));
  assert.equal(result.status, 504);
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
