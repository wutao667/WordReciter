export const config = {
  runtime: 'edge',
};

const MINIMAX_TTS_ENDPOINT = 'https://api.minimaxi.com/v1/t2a_v2';

const hexToBase64 = (hex: string) => {
  const cleanHex = hex.trim();
  if (!cleanHex || cleanHex.length % 2 !== 0) {
    throw new Error('MiniMax 返回的音频编码无效');
  }

  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    const byte = Number.parseInt(cleanHex.slice(i, i + 2), 16);
    if (Number.isNaN(byte)) throw new Error('MiniMax 返回的音频编码无效');
    bytes[i / 2] = byte;
  }

  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
};

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: '环境变量 MINIMAX_API_KEY 未配置' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json();
    const { text } = body;
    if (!text || typeof text !== 'string') {
      return new Response(JSON.stringify({ error: 'text 不能为空' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const response = await fetch(MINIMAX_TTS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'speech-2.6-hd',
        text,
        stream: false,
        voice_setting: {
          voice_id: 'male-qn-qingse',
          speed: 1.0,
          vol: 1.0,
          pitch: 0
        },
        pronunciation_dict: {
          tone: []
        },
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: 'mp3',
          channel: 1
        },
        subtitle_enable: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(JSON.stringify({ error: errorText || `MiniMax 语音失败: ${response.status}` }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await response.json();
    if (data?.base_resp?.status_code !== 0) {
      throw new Error(data?.base_resp?.status_msg || 'MiniMax 业务处理失败');
    }

    const audioHex = data?.data?.audio;
    if (!audioHex || typeof audioHex !== 'string') {
      return new Response(JSON.stringify({ error: 'MiniMax 响应中没有音频数据' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ audio: hexToBase64(audioHex) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || '内部服务器错误' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
