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
  const tencent = !!(process.env.TENCENT_SECRET_ID && process.env.TENCENT_SECRET_KEY);
  const minimax = !!process.env.MINIMAX_API_KEY;
  const glm = !!process.env.GLM_API_KEY;
  const preferred = edge ? 'edge' : tencent ? 'tencent' : minimax ? 'minimax' : glm ? 'glm' : 'local';

  return jsonResponse(res, 200, {
    edge,
    tencent,
    minimax,
    glm,
    available: edge || tencent || minimax || glm,
    preferred
  });
}
