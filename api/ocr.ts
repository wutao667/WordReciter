
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
        config: {
          thinkingConfig: { thinkingBudget: 0 } // 极速响应
        }
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

    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [{
          inlineData: {
            mimeType: 'image/jpeg',
            data: image,
          },
        }],
      },
      config: {
        systemInstruction: "你是一个专业的 OCR 插件。请提取图片中所有的英文单词和中文词汇。每行只输出一个单词或短语。不要输出数字、页码、标点符号、Markdown 格式或任何多余的解释。只返回纯文本单词列表。",
        thinkingConfig: { thinkingBudget: 0 }, // 禁用思考，降低延迟，防止 Edge Function 超时
      },
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
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message || '内部服务器错误' 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
