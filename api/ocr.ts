
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
    
    // As per user request, using GEM_API_KEY instead of the standard API_KEY
    const apiKey = process.env.GEM_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'GEM_API_KEY not configured on server' }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    const model = 'gemini-3-flash-preview';

    // Diagnostic Connectivity Test
    if (type === 'test') {
      const response = await ai.models.generateContent({
        model,
        contents: 'ping',
      });

      return new Response(JSON.stringify({ 
        success: !!response.text, 
        message: "Gemini API handshake successful"
      }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Standard OCR Extraction using Gemini Vision
    const imagePart = {
      inlineData: {
        mimeType: 'image/jpeg',
        data: image, // Base64 string
      },
    };

    const promptPart = {
      text: "Extract only English and Chinese words/phrases from the image. List them one per line. Strictly exclude any numbers, page numbers, dates, or non-textual symbols. Return ONLY the words themselves."
    };

    const response = await ai.models.generateContent({
      model,
      contents: { parts: [imagePart, promptPart] },
    });

    const text = response.text || "";
    
    // Gemini returns text directly. We wrap it in a structure compatible with the frontend expectation.
    return new Response(JSON.stringify({
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
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
