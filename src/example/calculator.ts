/**
 * A simple calculator class for testing class method detection
 */
export class Calculator {
  private history: number[] = [];

  /**
   * Add two numbers together
   * @param a First number
   * @param b Second number
   * @returns Sum of a and b
   */
  add(a: number, b: number): number {
    const result = a + b;
    this.history.push(result);
    return result;
  }

  /**
   * Subtract b from a
   * @param a First number
   * @param b Second number  
   * @returns Difference of a and b
   */
  subtract(a: number, b: number): number {
    const result = a - b;
    this.history.push(result);
    return result;
  }

  /**
   * Get calculation history
   * @returns Array of previous calculation results
   */
  getHistory(): number[] {
    return [...this.history];
  }

  /**
   * Clear calculation history
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Async method to validate a number
   * @param value Number to validate
   * @returns Promise resolving to true if valid
   */
  async validateNumber(value: unknown): Promise<boolean> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(typeof value === 'number' && !isNaN(value));
      }, 10);
    });
  }
}