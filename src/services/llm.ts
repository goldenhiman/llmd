import { configManager } from '../config/manager.js';
import { createProvider } from '../providers/index.js';
import { getShellContext } from '../utils/terminal.js';
import type { LLMProvider, GeneratedCommand, VerificationResult, ShellContext } from '../types.js';

export class LLMService {
  private provider: LLMProvider | null = null;
  private context: ShellContext;

  constructor() {
    this.context = getShellContext();
  }

  private getProvider(): LLMProvider {
    if (this.provider) {
      return this.provider;
    }

    const activeProvider = configManager.getActiveProviderConfig();
    if (!activeProvider) {
      throw new Error(
        'No LLM provider configured. Run "llmd setup" to configure a provider.'
      );
    }

    this.provider = createProvider(activeProvider.name, activeProvider.config);
    return this.provider;
  }

  async generateCommand(query: string): Promise<GeneratedCommand> {
    const provider = this.getProvider();
    return provider.generateCommand(query, this.context);
  }

  async verifyCommand(command: string, query: string): Promise<VerificationResult> {
    const provider = this.getProvider();
    return provider.verifyCommand(command, query, this.context);
  }

  getContext(): ShellContext {
    return this.context;
  }

  getProviderName(): string {
    const activeProvider = configManager.getActiveProviderConfig();
    return activeProvider?.name || 'unknown';
  }

  getModelName(): string {
    const activeProvider = configManager.getActiveProviderConfig();
    return activeProvider?.config.model || 'unknown';
  }
}

export const llmService = new LLMService();

