import chalk from 'chalk';
import inquirer from 'inquirer';
import { configManager } from '../config/manager.js';
import { PROVIDER_MODELS } from '../utils/prompts.js';
import type { ProviderName } from '../types.js';

const VALID_PROVIDERS: ProviderName[] = ['openai', 'anthropic', 'groq', 'gemini', 'openrouter'];

export function listProviders(): void {
  console.log('\n' + chalk.bold('Configured Providers:\n'));

  const providers = configManager.listProviders();
  const threshold = configManager.getConfidenceThreshold();

  for (const provider of providers) {
    const status = provider.configured ? chalk.green('✓') : chalk.dim('○');
    const defaultBadge = provider.isDefault ? chalk.cyan(' (default)') : '';
    const model = provider.model ? chalk.dim(` [${provider.model}]`) : '';
    
    console.log(`  ${status} ${provider.name}${model}${defaultBadge}`);
  }

  console.log('\n' + chalk.dim(`Confidence threshold: ${threshold}%`));
  console.log(chalk.dim(`Config file: ${configManager.path}\n`));
}

export async function setProvider(provider: string, apiKey?: string): Promise<void> {
  if (!VALID_PROVIDERS.includes(provider as ProviderName)) {
    console.log(chalk.red(`\nInvalid provider: ${provider}`));
    console.log(chalk.dim(`Valid providers: ${VALID_PROVIDERS.join(', ')}\n`));
    return;
  }

  const providerName = provider as ProviderName;
  let key = apiKey;

  if (!key) {
    const { inputKey } = await inquirer.prompt<{ inputKey: string }>([
      {
        type: 'password',
        name: 'inputKey',
        message: `Enter API key for ${provider}:`,
        mask: '*',
        validate: (input: string) => {
          if (!input || input.trim().length === 0) {
            return 'API key is required';
          }
          return true;
        }
      }
    ]);
    key = inputKey;
  }

  const models = PROVIDER_MODELS[providerName] || [];
  const { model } = await inquirer.prompt<{ model: string }>([
    {
      type: 'list',
      name: 'model',
      message: 'Select model:',
      choices: models,
      default: models[0]
    }
  ]);

  configManager.setProvider(providerName, key!.trim(), model);
  console.log(chalk.green(`\n✓ ${provider} configured successfully!\n`));
}

export function setDefault(provider: string): void {
  if (!VALID_PROVIDERS.includes(provider as ProviderName)) {
    console.log(chalk.red(`\nInvalid provider: ${provider}`));
    console.log(chalk.dim(`Valid providers: ${VALID_PROVIDERS.join(', ')}\n`));
    return;
  }

  const providerConfig = configManager.getProvider(provider as ProviderName);
  if (!providerConfig?.apiKey) {
    console.log(chalk.yellow(`\nProvider ${provider} is not configured yet.`));
    console.log(chalk.dim(`Run: llmd config set ${provider}\n`));
    return;
  }

  configManager.setDefaultProvider(provider as ProviderName);
  console.log(chalk.green(`\n✓ Default provider set to ${provider}\n`));
}

export function setThreshold(value: string): void {
  const threshold = parseInt(value, 10);
  
  if (isNaN(threshold) || threshold < 0 || threshold > 100) {
    console.log(chalk.red('\nThreshold must be a number between 0 and 100\n'));
    return;
  }

  configManager.setConfidenceThreshold(threshold);
  console.log(chalk.green(`\n✓ Confidence threshold set to ${threshold}%\n`));
}

export function setModel(provider: string, model: string): void {
  if (!VALID_PROVIDERS.includes(provider as ProviderName)) {
    console.log(chalk.red(`\nInvalid provider: ${provider}`));
    return;
  }

  const providerConfig = configManager.getProvider(provider as ProviderName);
  if (!providerConfig?.apiKey) {
    console.log(chalk.yellow(`\nProvider ${provider} is not configured yet.`));
    console.log(chalk.dim(`Run: llmd config set ${provider}\n`));
    return;
  }

  const validModels = PROVIDER_MODELS[provider] || [];
  if (!validModels.includes(model)) {
    console.log(chalk.yellow(`\nWarning: ${model} is not in the known models list.`));
    console.log(chalk.dim(`Known models: ${validModels.join(', ')}`));
    console.log(chalk.dim('Proceeding anyway...\n'));
  }

  configManager.setProviderModel(provider as ProviderName, model);
  console.log(chalk.green(`\n✓ Model for ${provider} set to ${model}\n`));
}

export function showPath(): void {
  console.log(`\nConfig file: ${configManager.path}\n`);
}

export function resetConfig(): void {
  configManager.reset();
  console.log(chalk.green('\n✓ Configuration reset to defaults\n'));
}

