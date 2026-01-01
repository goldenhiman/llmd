import type { LLMProvider, ProviderConfig, ProviderName } from '../types.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { GroqProvider } from './groq.js';
import { GeminiProvider } from './gemini.js';
import { OpenRouterProvider } from './openrouter.js';

export function createProvider(name: ProviderName, config: ProviderConfig): LLMProvider {
  switch (name) {
    case 'openai':
      return new OpenAIProvider(config);
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'groq':
      return new GroqProvider(config);
    case 'gemini':
      return new GeminiProvider(config);
    case 'openrouter':
      return new OpenRouterProvider(config);
    default:
      throw new Error(`Unknown provider: ${name}`);
  }
}

export { OpenAIProvider, AnthropicProvider, GroqProvider, GeminiProvider, OpenRouterProvider };

