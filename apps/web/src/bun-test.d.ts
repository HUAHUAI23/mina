declare module 'bun:test' {
  export interface TestOptions {
    readonly timeout?: number
  }

  export interface TestFunction {
    (name: string, fn: () => unknown | Promise<unknown>, options?: TestOptions): void
    skip(name: string, fn?: () => unknown | Promise<unknown>, options?: TestOptions): void
    todo(name: string, fn?: () => unknown | Promise<unknown>, options?: TestOptions): void
    only(name: string, fn: () => unknown | Promise<unknown>, options?: TestOptions): void
  }

  export interface Expectation<T = unknown> {
    readonly not: Expectation<T>
    toBe(expected: unknown): void
    toBeDefined(): void
    toBeFalsy(): void
    toBeFalse(): void
    toBeGreaterThan(expected: number): void
    toBeGreaterThanOrEqual(expected: number): void
    toBeLessThan(expected: number): void
    toBeLessThanOrEqual(expected: number): void
    toBeNull(): void
    toBeTrue(): void
    toBeUndefined(): void
    toContain(expected: unknown): void
    toEqual(expected: unknown): void
    toHaveLength(expected: number): void
    toMatch(expected: RegExp | string): void
    toThrow(expected?: RegExp | string): void
  }

  export const test: TestFunction
  export const it: TestFunction
  export const describe: TestFunction
  export const expect: <T = unknown>(actual: T) => Expectation<T>
}
