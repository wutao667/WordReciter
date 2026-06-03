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
    const apiKey = process.env.AZURE_API_KEY;
    const region = process.env.AZURE_REGION || 'eastasia';
    if (!apiKey) {
      return new Response(JSON.stringify({ error: '环境变量 AZURE_API_KEY 未配置' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json();
    const { text, voice, speed = 0.6 } = body;
    if (!text || typeof text !== 'string') {
      return new Response(JSON.stringify({ error: 'text 不能为空' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const isChinese = /[\u4e00-\u9fa5]/.test(text);
    const voiceName = voice || (isChinese ? 'zh-CN-XiaoxiaoNeural' : 'en-US-AvaMultilingualNeural');
    const lang = isChinese ? 'zh-CN' : 'en-US';
    const ssml = `<speak version='1.0' xml:lang='${lang}'><voice name='${voiceName}'><prosody rate='${speed}'>${text}</prosody></voice></speak>`;
    const endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
        'User-Agent': 'LingoEcho'
      },
      body: ssml
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(JSON.stringify({ error: errorText || `Azure TTS 错误: ${response.status}` }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'audio/mpeg'
      }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || '内部服务器错误' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
