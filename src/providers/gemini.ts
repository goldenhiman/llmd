import { GoogleGenerativeAI } from '@google/generative-ai';
import { BaseLLMProvider } from './base.js';
import type { ProviderConfig, ProviderName } from '../types.js';

export class GeminiProvider extends BaseLLMProvider {
  name: ProviderName = 'gemini';
  private client: GoogleGenerativeAI;

  constructor(config: ProviderConfig) {
    super(config);
    this.client = new GoogleGenerativeAI(config.apiKey);
  }

  async chat(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): Promise<string> {
    const model = this.client.getGenerativeModel({ 
      model: this.config.model,
      systemInstruction: messages.find(m => m.role === 'system')?.content
    });

    const history = messages
      .filter(m => m.role !== 'system')
      .slice(0, -1)
      .map(m => ({
        role: m.role === 'user' ? 'user' as const : 'model' as const,
        parts: [{ text: m.content }]
      }));

    const chat = model.startChat({ history });
    const lastMessage = messages.filter(m => m.role !== 'system').pop();
    
    if (!lastMessage) {
      throw new Error('No user message provided');
    }

    const result = await chat.sendMessage(lastMessage.content);
    return result.response.text();
  }
}

