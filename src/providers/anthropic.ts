import Anthropic from '@anthropic-ai/sdk';
import { BaseLLMProvider } from './base.js';
import type { ProviderConfig, ProviderName } from '../types.js';

export class AnthropicProvider extends BaseLLMProvider {
  name: ProviderName = 'anthropic';
  private client: Anthropic;

  constructor(config: ProviderConfig) {
    super(config);
    this.client = new Anthropic({
      apiKey: config.apiKey
    });
  }

  async chat(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): Promise<string> {
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const userMessages = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }));

    const response = await this.client.messages.create({
      model: this.config.model,
      max_tokens: 1024,
      system: systemMessage,
      messages: userMessages
    });

    const textContent = response.content.find(c => c.type === 'text');
    return textContent?.type === 'text' ? textContent.text : '';
  }
}

