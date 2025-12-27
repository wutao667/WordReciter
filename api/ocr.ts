
import { GoogleGenAI } from "@google/genai";

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
    
    // 遵循用户要求：使用 GEM_API_KEY
    const apiKey = process.env.GEM_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: '环境变量 GEM_API_KEY 未配置' }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    const model = 'gemini-3-flash-preview';

    // 诊断性连接测试
    if (type === 'test') {
      const response = await ai.models.generateContent({
        model,
        contents: 'ping',
      });

      return new Response(JSON.stringify({ 
        success: !!response.text, 
        message: "Gemini API 握手成功"
      }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 图片解析逻辑
    if (!image) {
       throw new Error("未接收到图像数据 (image base64 is missing)");
    }

    const imagePart = {
      inlineData: {
        mimeType: 'image/jpeg',
        data: image, // Base64 字符串
      },
    };

    const promptPart = {
      text: "请提取图片中所有的英文单词和中文词汇。每行只输出一个单词或短语。不要输出数字、页码、标点符号或任何多余的解释。只返回单词列表。"
    };

    const response = await ai.models.generateContent({
      model,
      contents: { parts: [imagePart, promptPart] },
    });

    const text = response.text || "";
    
    return new Response(JSON.stringify({
      success: true,
      choices: [{
        message: {
          content: text
        }
      }]
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Gemini API Error:', error);
    // 确保错误响应也是 JSON
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message || '内部服务器错误' 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
