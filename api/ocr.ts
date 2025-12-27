
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
    const { image, type, languages } = body; 
    
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
          thinkingConfig: { thinkingBudget: 0 } 
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

    // 动态构建语种提示词
    let langInstruction = "英文单词和中文词汇";
    if (Array.isArray(languages) && languages.length > 0) {
      const hasZh = languages.includes('zh');
      const hasEn = languages.includes('en');
      if (hasZh && !hasEn) langInstruction = "中文词汇（忽略并完全不输出任何英文单词）";
      else if (hasEn && !hasZh) langInstruction = "英文单词（忽略并完全不输出任何中文词汇）";
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
        systemInstruction: `你是一个专业的 OCR 插件。请提取图片中所有的${langInstruction}。每行只输出一个单词或短语。
        
【强制规则】：
1. 只输出单词列表，每行一个。
2. 严禁输出任何解释、道歉、描述或对话。
3. 如果图中没有符合条件的词汇，请直接返回一个完全为空的字符串。
4. 严禁出现“图片中不包含...”、“没找到...”、“图中没有...”等任何类似的说明文字。
5. 忽略数字、标点、Markdown 格式。`,
        thinkingConfig: { thinkingBudget: 0 }, 
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
