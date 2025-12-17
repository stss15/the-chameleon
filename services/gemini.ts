import { GoogleGenAI, Type } from "@google/genai";
import { TopicCard } from "../types";

// Note: In a production app, never expose API keys on the client. 
// This is for demonstration purposes or requires a proxy.
// We will check for the key in localStorage or environment.

export const generateTopic = async (promptTopic: string): Promise<TopicCard> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const systemInstruction = `You are a game content generator for "The Chameleon". 
  Generate a topic card with a category and exactly 16 distinct words related to that category.
  The words should be simple nouns or concepts.
  The output must be strictly JSON.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Generate a grid for the category: "${promptTopic || 'Random interesting topic'}".`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
            category: { type: Type.STRING },
            words: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
            }
        },
        required: ["category", "words"]
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("No response from AI");
  
  const data = JSON.parse(text);
  
  // Ensure we have exactly 16 words (pad or slice)
  let words = data.words;
  if (words.length > 16) words = words.slice(0, 16);
  while (words.length < 16) words.push("Empty");

  return {
    category: data.category,
    words: words
  };
};