import OpenAI from 'openai';
import { BaseLLMProvider } from './base.js';
import type { ProviderConfig, ProviderName } from '../types.js';

export class OpenRouterProvider extends BaseLLMProvider {
  name: ProviderName = 'openrouter';
  private client: OpenAI;

  constructor(config: ProviderConfig) {
    super(config);
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://github.com/llmd/llmd',
        'X-Title': 'llmd'
      }
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

