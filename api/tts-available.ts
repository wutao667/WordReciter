export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const edge = true;
  const glm = !!process.env.GLM_API_KEY;

  return new Response(JSON.stringify({
    edge,
    glm,
    available: true,
    preferred: 'edge'
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
