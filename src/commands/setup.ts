import inquirer from 'inquirer';
import chalk from 'chalk';
import { configManager } from '../config/manager.js';
import { PROVIDER_MODELS } from '../utils/prompts.js';
import { scanCliTools, hasScannedTools } from '../utils/tools.js';
import { toolsConfigManager } from '../config/tools.js';
import type { ProviderName, ToolInfo } from '../types.js';

const PROVIDER_DISPLAY_NAMES: Record<ProviderName, string> = {
  openai: 'OpenAI (GPT-4o)',
  anthropic: 'Anthropic (Claude)',
  groq: 'Groq (Llama 3.3)',
  gemini: 'Google Gemini',
  openrouter: 'OpenRouter (Multiple providers)'
};

const API_KEY_HINTS: Record<ProviderName, string> = {
  openai: 'Get your API key at: https://platform.openai.com/api-keys',
  anthropic: 'Get your API key at: https://console.anthropic.com/settings/keys',
  groq: 'Get your API key at: https://console.groq.com/keys',
  gemini: 'Get your API key at: https://aistudio.google.com/app/apikey',
  openrouter: 'Get your API key at: https://openrouter.ai/keys'
};

export async function runSetup(): Promise<void> {
  console.log('\n' + chalk.bold.cyan('🚀 Welcome to llmd Setup\n'));
  console.log(chalk.dim('Let\'s configure your LLM provider to get started.\n'));

  // Select provider
  const { provider } = await inquirer.prompt<{ provider: ProviderName }>([
    {
      type: 'list',
      name: 'provider',
      message: 'Select your preferred LLM provider:',
      choices: Object.entries(PROVIDER_DISPLAY_NAMES).map(([value, name]) => ({
        name,
        value
      }))
    }
  ]);

  console.log(chalk.dim(`\n${API_KEY_HINTS[provider]}\n`));

  // Enter API key
  const { apiKey } = await inquirer.prompt<{ apiKey: string }>([
    {
      type: 'password',
      name: 'apiKey',
      message: `Enter your ${PROVIDER_DISPLAY_NAMES[provider]} API key:`,
      mask: '*',
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return 'API key is required';
        }
        return true;
      }
    }
  ]);

  // Select model
  const models = PROVIDER_MODELS[provider] || [];
  const modelChoices = [
    ...models.map(m => ({ name: m, value: m })),
    { name: chalk.dim('↳ Enter custom model name...'), value: '__custom__' }
  ];
  
  const { modelSelection } = await inquirer.prompt<{ modelSelection: string }>([
    {
      type: 'list',
      name: 'modelSelection',
      message: 'Select your preferred model:',
      choices: modelChoices,
      default: models[0]
    }
  ]);

  let model = modelSelection;
  if (modelSelection === '__custom__') {
    const { customModel } = await inquirer.prompt<{ customModel: string }>([
      {
        type: 'input',
        name: 'customModel',
        message: 'Enter the model name:',
        validate: (input: string) => {
          if (!input || input.trim().length === 0) {
            return 'Model name is required';
          }
          return true;
        }
      }
    ]);
    model = customModel.trim();
  }

  // Set confidence threshold
  const { threshold } = await inquirer.prompt<{ threshold: number }>([
    {
      type: 'number',
      name: 'threshold',
      message: 'Set confidence threshold (0-100, commands below this will ask for clarification):',
      default: 70,
      validate: (input: number) => {
        if (input < 0 || input > 100) {
          return 'Threshold must be between 0 and 100';
        }
        return true;
      }
    }
  ]);

  // Save configuration
  configManager.setProvider(provider, apiKey.trim(), model);
  configManager.setDefaultProvider(provider);
  configManager.setConfidenceThreshold(threshold);

  console.log('\n' + chalk.green('✓ Configuration saved successfully!\n'));
  console.log(chalk.dim(`Config file: ${configManager.path}\n`));

  // Ask if user wants to add more providers
  const { addMore } = await inquirer.prompt<{ addMore: boolean }>([
    {
      type: 'confirm',
      name: 'addMore',
      message: 'Would you like to add another provider?',
      default: false
    }
  ]);

  if (addMore) {
    await addAdditionalProvider();
  }

  // Ask to scan CLI tools
  await promptToolsScan();

  console.log('\n' + chalk.bold.green('🎉 Setup complete!\n'));
  console.log('You can now use llmd:');
  console.log(chalk.cyan('  llmd "your natural language command"\n'));
  console.log('Examples:');
  console.log(chalk.dim('  llmd "list all files sorted by size"'));
  console.log(chalk.dim('  llmd "create a new git branch called feature-auth"'));
  console.log(chalk.dim('  llmd "find all JavaScript files containing console.log"\n'));
}

async function promptToolsScan(): Promise<void> {
  const alreadyScanned = hasScannedTools();
  
  let message: string;
  if (alreadyScanned) {
    message = 'Would you like to rescan your system for available CLI tools?';
  } else {
    message = 'Would you like to scan your system for available CLI tools?\n' +
              chalk.dim('  (This helps llmd generate more accurate commands for your system)');
  }

  const { scanTools } = await inquirer.prompt<{ scanTools: boolean }>([
    {
      type: 'confirm',
      name: 'scanTools',
      message,
      default: !alreadyScanned // Default to yes if not scanned, no if already scanned
    }
  ]);

  if (scanTools) {
    console.log('\n' + chalk.bold.cyan('🔍 Scanning System CLI Tools\n'));
    
    const tools = await scanCliTools(true);
    
    // Save to separate tools config
    toolsConfigManager.setAvailableTools(tools);

    // Display summary by category
    const byCategory: Record<string, ToolInfo[]> = {};
    for (const tool of tools) {
      const cat = tool.description || 'Other';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(tool);
    }

    console.log('\n' + chalk.bold('Available tools by category:\n'));
    for (const [category, categoryTools] of Object.entries(byCategory).sort()) {
      console.log(
        chalk.cyan(`  ${category}: `) +
        chalk.dim(categoryTools.map(t => t.name).join(', '))
      );
    }

    console.log('\n' + chalk.green('✓ Tool information saved'));
    console.log(chalk.dim(`  Tools config: ${toolsConfigManager.path}`));
  } else if (!alreadyScanned) {
    console.log(chalk.dim('\nYou can scan tools later with: llmd scan'));
  }
}

async function addAdditionalProvider(): Promise<void> {
  const configuredProviders = configManager.listProviders()
    .filter(p => p.configured)
    .map(p => p.name);

  const availableProviders = Object.entries(PROVIDER_DISPLAY_NAMES)
    .filter(([key]) => !configuredProviders.includes(key as ProviderName));

  if (availableProviders.length === 0) {
    console.log(chalk.yellow('\nAll providers are already configured!'));
    return;
  }

  const { provider } = await inquirer.prompt<{ provider: ProviderName }>([
    {
      type: 'list',
      name: 'provider',
      message: 'Select another provider to configure:',
      choices: availableProviders.map(([value, name]) => ({
        name,
        value
      }))
    }
  ]);

  console.log(chalk.dim(`\n${API_KEY_HINTS[provider]}\n`));

  const { apiKey } = await inquirer.prompt<{ apiKey: string }>([
    {
      type: 'password',
      name: 'apiKey',
      message: `Enter your ${PROVIDER_DISPLAY_NAMES[provider]} API key:`,
      mask: '*',
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return 'API key is required';
        }
        return true;
      }
    }
  ]);

  const models = PROVIDER_MODELS[provider] || [];
  const modelChoices = [
    ...models.map(m => ({ name: m, value: m })),
    { name: chalk.dim('↳ Enter custom model name...'), value: '__custom__' }
  ];
  
  const { modelSelection } = await inquirer.prompt<{ modelSelection: string }>([
    {
      type: 'list',
      name: 'modelSelection',
      message: 'Select your preferred model:',
      choices: modelChoices,
      default: models[0]
    }
  ]);

  let model = modelSelection;
  if (modelSelection === '__custom__') {
    const { customModel } = await inquirer.prompt<{ customModel: string }>([
      {
        type: 'input',
        name: 'customModel',
        message: 'Enter the model name:',
        validate: (input: string) => {
          if (!input || input.trim().length === 0) {
            return 'Model name is required';
          }
          return true;
        }
      }
    ]);
    model = customModel.trim();
  }

  configManager.setProvider(provider, apiKey.trim(), model);
  console.log(chalk.green(`\n✓ ${PROVIDER_DISPLAY_NAMES[provider]} configured!`));

  const { addMore } = await inquirer.prompt<{ addMore: boolean }>([
    {
      type: 'confirm',
      name: 'addMore',
      message: 'Add another provider?',
      default: false
    }
  ]);

  if (addMore) {
    await addAdditionalProvider();
  }
}

