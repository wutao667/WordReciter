
export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { 
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await req.json();
    const { image, type } = body;
    const apiKey = process.env.GLM_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'GLM_API_KEY not configured on server' }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const endpoint = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

    // Diagnostic Connectivity Test
    if (type === 'test') {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "glm-4.5-flash",
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 10
        })
      });

      const data = await response.json();
      return new Response(JSON.stringify({ 
        success: response.ok, 
        status: response.status,
        data: data 
      }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Standard OCR Extraction
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "glm-4.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } },
              { 
                type: "text", 
                text: "Extract only English and Chinese words/phrases from the image. List them one per line. Strictly exclude any numbers, page numbers, dates, or non-textual symbols. Return ONLY the words themselves." 
              }
            ]
          }
        ]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return new Response(JSON.stringify(data), { 
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(data), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
