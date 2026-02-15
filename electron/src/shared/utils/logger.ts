/**
 * Logger utility for consistent logging with prefixes
 */
export class Logger {
  constructor(private prefix: string) {}

  log(...args: any[]): void {
    console.log(`[${this.prefix}]`, ...args)
  }

  error(...args: any[]): void {
    console.error(`[${this.prefix}]`, ...args)
  }

  warn(...args: any[]): void {
    console.warn(`[${this.prefix}]`, ...args)
  }

  debug(...args: any[]): void {
    console.debug(`[${this.prefix}]`, ...args)
  }
}
