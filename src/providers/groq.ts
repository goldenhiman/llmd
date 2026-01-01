import Groq from 'groq-sdk';
import { BaseLLMProvider } from './base.js';
import type { ProviderConfig, ProviderName } from '../types.js';

export class GroqProvider extends BaseLLMProvider {
  name: ProviderName = 'groq';
  private client: Groq;

  constructor(config: ProviderConfig) {
    super(config);
    this.client = new Groq({
      apiKey: config.apiKey
    });
  }

  async chat(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.config.model,
      messages,
      temperature: 0.3,
      max_tokens: 1024
    });

    return response.choices[0]?.message?.content || '';
  }
}

