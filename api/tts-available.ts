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
  const azure = !!process.env.AZURE_API_KEY;
  const glm = !!process.env.GLM_API_KEY;

  return new Response(JSON.stringify({
    edge,
    azure,
    glm,
    available: edge || azure || glm,
    preferred: edge ? 'edge' : azure ? 'azure' : glm ? 'glm' : null
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
