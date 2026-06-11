import chalk from 'chalk';

function timestamp(): string {
  return chalk.gray(`[${new Date().toLocaleTimeString()}]`);
}

export const log = {
  info:    (msg: string) => console.log(`${timestamp()} ${chalk.blue('ℹ')}  ${msg}`),
  success: (msg: string) => console.log(`${timestamp()} ${chalk.green('✅')} ${msg}`),
  error:   (msg: string) => console.error(`${timestamp()} ${chalk.red('❌')} ${msg}`),
  step:    (msg: string) => console.log(`${timestamp()} ${chalk.cyan('→')}  ${msg}`),
  warn:    (msg: string) => console.warn(`${timestamp()} ${chalk.yellow('⚠️')}  ${msg}`),
};
