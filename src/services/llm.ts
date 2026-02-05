import { configManager } from '../config/manager.js';
import { createProvider } from '../providers/index.js';
import { getShellContext } from '../utils/terminal.js';
import { sessionManager } from './session.js';
import type { LLMProvider, GeneratedCommand, GeneratedCommandResult, VerificationResult, ShellContext } from '../types.js';

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
    // Update context before generating (in case cwd changed)
    this.context = getShellContext();
    
    // Ensure we have an active session
    sessionManager.getCurrentSession();
    
    return provider.generateCommand(query, this.context);
  }

  async generateCommandWithInfoGathering(query: string): Promise<GeneratedCommandResult> {
    const provider = this.getProvider();
    // Update context before generating (in case cwd changed)
    this.context = getShellContext();
    
    // Ensure we have an active session
    sessionManager.getCurrentSession();
    
    return provider.generateCommandWithInfoGathering(query, this.context);
  }

  async generateCommandWithContext(query: string, gatheredInfo: string): Promise<GeneratedCommand> {
    const provider = this.getProvider();
    // Update context before generating (in case cwd changed)
    this.context = getShellContext();
    
    // Ensure we have an active session
    sessionManager.getCurrentSession();
    
    return provider.generateCommandWithContext(query, this.context, gatheredInfo);
  }

  async verifyCommand(command: string, query: string): Promise<VerificationResult> {
    const provider = this.getProvider();
    return provider.verifyCommand(command, query, this.context);
  }

  async checkInformationalResponse(command: string, query: string): Promise<{ isInformational: boolean; message?: string }> {
    const provider = this.getProvider();
    return provider.checkInformationalResponse(command, query);
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

