import { probeEdgeTts } from '../server/edgeTts.js';

const jsonResponse = (res: any, status: number, payload: Record<string, unknown>) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonResponse(res, 405, { error: 'Method Not Allowed' });
  }

  const edge = await probeEdgeTts(3000);
  const minimax = !!process.env.MINIMAX_API_KEY;
  const glm = !!process.env.GLM_API_KEY;
  const preferred = edge ? 'edge' : minimax ? 'minimax' : glm ? 'glm' : 'local';

  return jsonResponse(res, 200, {
    edge,
    minimax,
    glm,
    available: edge || minimax || glm,
    preferred
  });
}
