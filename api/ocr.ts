
import { GoogleGenAI } from "@google/genai";

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: '仅支持 POST 请求' }), { 
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error('服务器未配置 API_KEY 环境参数');
    }

    const ai = new GoogleGenAI({ apiKey });
    const body = await req.json();
    const { image, type } = body;
    const modelName = 'gemini-3-flash-preview';

    // 诊断测试：简单的握手
    if (type === 'test') {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: 'Hello',
      });
      return new Response(JSON.stringify({ 
        success: true, 
        message: "Gemini API 握手成功",
        text: response.text
      }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // OCR 图像处理
    if (!image) {
      throw new Error('未提供有效的图像数据');
    }

    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: image, // base64 字符串
            },
          },
          {
            text: "请提取图片中所有的英文单词和中文词汇。每行只输出一个单词或短语。不要输出数字、页码、标点符号或任何多余的解释。只返回单词列表。"
          }
        ]
      },
    });

    const resultText = response.text || "";
    
    // 返回给前端的结构，保持原有的 choices 结构以兼容现有代码，或直接返回数据
    return new Response(JSON.stringify({
      success: true,
      choices: [{
        message: {
          content: resultText
        }
      }]
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('OCR Proxy Error:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message || '内部服务器错误' 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
