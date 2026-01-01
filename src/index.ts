#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { runSetup } from './commands/setup.js';
import { runCommand } from './commands/run.js';
import {
  listProviders,
  setProvider,
  setDefault,
  setThreshold,
  setModel,
  showPath,
  resetConfig
} from './commands/config.js';
import { checkUpdate, installUpdate } from './commands/update.js';
import { runToolsScan, listTools } from './utils/tools.js';
import { getCurrentVersion } from './utils/version.js';

const program = new Command();

// ASCII Art Banner
const banner = `
${chalk.cyan('  _ _               _ ')}
${chalk.cyan(' | | |_ __ ___   __| |')}
${chalk.cyan(' | | | \'_ \` _ \\ / _\` |')}
${chalk.cyan(' | | | | | | | | (_| |')}
${chalk.cyan(' |_|_|_| |_| |_|\\__,_|')}
${chalk.dim(' Talk to your terminal')}
`;

program
  .name('llmd')
  .description('Natural language to shell commands using AI')
  .version(getCurrentVersion())
  .addHelpText('beforeAll', banner);

// Main command - run natural language query
program
  .argument('[query...]', 'Natural language command to translate')
  .action(async (queryParts: string[]) => {
    if (queryParts.length === 0) {
      console.log(banner);
      program.help();
      return;
    }
    
    const query = queryParts.join(' ');
    await runCommand(query);
  });

// Setup command
program
  .command('setup')
  .description('Interactive setup wizard')
  .action(async () => {
    await runSetup();
  });

// Config commands
const configCmd = program
  .command('config')
  .description('Manage configuration');

configCmd
  .command('list')
  .description('List all configured providers')
  .action(() => {
    listProviders();
  });

configCmd
  .command('set <provider> [apiKey]')
  .description('Configure a provider with API key')
  .action(async (provider: string, apiKey?: string) => {
    await setProvider(provider, apiKey);
  });

configCmd
  .command('default <provider>')
  .description('Set the default provider')
  .action((provider: string) => {
    setDefault(provider);
  });

configCmd
  .command('threshold <value>')
  .description('Set confidence threshold (0-100)')
  .action((value: string) => {
    setThreshold(value);
  });

configCmd
  .command('model <provider> <model>')
  .description('Set the model for a provider')
  .action((provider: string, model: string) => {
    setModel(provider, model);
  });

configCmd
  .command('path')
  .description('Show config file path')
  .action(() => {
    showPath();
  });

configCmd
  .command('reset')
  .description('Reset configuration to defaults')
  .action(() => {
    resetConfig();
  });

// Update commands
const updateCmd = program
  .command('update')
  .description('Check for and install updates');

updateCmd
  .command('check')
  .description('Check if a newer version is available')
  .action(async () => {
    await checkUpdate();
  });

updateCmd
  .command('install')
  .description('Install the latest version')
  .action(async () => {
    await installUpdate();
  });

// Shorthand: 'llmd update' without subcommand runs check
updateCmd
  .action(async () => {
    await checkUpdate();
  });

// Scan command
program
  .command('scan')
  .description('Scan system for available CLI tools')
  .action(async () => {
    await runToolsScan();
  });

// Tools command
program
  .command('tools')
  .description('List scanned CLI tools')
  .action(() => {
    listTools();
  });

// Parse and execute
program.parse();

