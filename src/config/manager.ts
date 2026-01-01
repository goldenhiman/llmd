import Conf from 'conf';
import type { Config, ProviderConfig, ProviderName } from '../types.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_CONFIG: Config = {
  defaultProvider: 'openai',
  confidenceThreshold: 70,
  providers: {},
  lastVersionCheck: undefined
};

const DEFAULT_MODELS: Record<ProviderName, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
  groq: 'llama-3.3-70b-versatile',
  gemini: 'gemini-2.0-flash',
  openrouter: 'anthropic/claude-sonnet-4-20250514'
};

class ConfigManager {
  private config: Conf<Config>;

  constructor() {
    this.config = new Conf<Config>({
      projectName: 'llmd',
      defaults: DEFAULT_CONFIG,
      schema: {
        defaultProvider: {
          type: 'string',
          enum: ['openai', 'anthropic', 'groq', 'gemini', 'openrouter']
        },
        confidenceThreshold: {
          type: 'number',
          minimum: 0,
          maximum: 100
        },
        providers: {
          type: 'object'
        },
        lastVersionCheck: {
          type: 'number'
        }
      }
    });
  }

  get path(): string {
    return this.config.path;
  }

  getDefaultProvider(): ProviderName {
    return this.config.get('defaultProvider');
  }

  setDefaultProvider(provider: ProviderName): void {
    this.config.set('defaultProvider', provider);
  }

  getConfidenceThreshold(): number {
    return this.config.get('confidenceThreshold');
  }

  setConfidenceThreshold(threshold: number): void {
    if (threshold < 0 || threshold > 100) {
      throw new Error('Threshold must be between 0 and 100');
    }
    this.config.set('confidenceThreshold', threshold);
  }

  getProvider(name: ProviderName): ProviderConfig | undefined {
    const providers = this.config.get('providers');
    return providers[name];
  }

  setProvider(name: ProviderName, apiKey: string, model?: string): void {
    const providers = this.config.get('providers');
    providers[name] = {
      apiKey,
      model: model || DEFAULT_MODELS[name]
    };
    this.config.set('providers', providers);
  }

  removeProvider(name: ProviderName): void {
    const providers = this.config.get('providers');
    delete providers[name];
    this.config.set('providers', providers);
  }

  listProviders(): Array<{ name: ProviderName; configured: boolean; isDefault: boolean; model?: string }> {
    const providers = this.config.get('providers');
    const defaultProvider = this.getDefaultProvider();
    
    const allProviders: ProviderName[] = ['openai', 'anthropic', 'groq', 'gemini', 'openrouter'];
    
    return allProviders.map(name => ({
      name,
      configured: !!providers[name]?.apiKey,
      isDefault: name === defaultProvider,
      model: providers[name]?.model
    }));
  }

  hasAnyProvider(): boolean {
    const providers = this.config.get('providers');
    return Object.values(providers).some(p => p?.apiKey);
  }

  getActiveProviderConfig(): { name: ProviderName; config: ProviderConfig } | null {
    const defaultProvider = this.getDefaultProvider();
    const providerConfig = this.getProvider(defaultProvider);
    
    if (providerConfig?.apiKey) {
      return { name: defaultProvider, config: providerConfig };
    }

    // Fallback to first configured provider
    const providers = this.config.get('providers');
    for (const [name, config] of Object.entries(providers)) {
      if (config?.apiKey) {
        return { name: name as ProviderName, config };
      }
    }

    return null;
  }

  setProviderModel(name: ProviderName, model: string): void {
    const provider = this.getProvider(name);
    if (!provider) {
      throw new Error(`Provider ${name} is not configured`);
    }
    this.setProvider(name, provider.apiKey, model);
  }

  reset(): void {
    this.config.clear();
  }

  // Version check rate limiting
  getLastVersionCheck(): number | undefined {
    return this.config.get('lastVersionCheck');
  }

  setLastVersionCheck(timestamp: number): void {
    this.config.set('lastVersionCheck', timestamp);
  }

  shouldCheckVersion(): boolean {
    const lastCheck = this.getLastVersionCheck();
    if (!lastCheck) return true;
    return Date.now() - lastCheck > ONE_DAY_MS;
  }
}

export const configManager = new ConfigManager();

