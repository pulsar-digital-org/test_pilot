export class Calculator {
    private history: number[] = [];

    /**
     * Adds two numbers and stores the result in history
     */
    add(a: number, b: number): number {
        const result = a + b;
        this.history.push(result);
        return result;
    }

    /**
     * Subtracts b from a and stores the result in history
     */
    subtract(a: number, b: number): number {
        const result = a - b;
        this.history.push(result);
        return result;
    }

    /**
     * Returns the calculation history
     */
    getHistory(): number[] {
        return [...this.history];
    }

    /**
     * Clears the calculation history
     */
    clearHistory(): void {
        this.history = [];
    }
}

/**
 * Utility function to calculate total with tax
 */
export function calculateTotal(items: number[], taxRate = 0.1): number {
    const subtotal = items.reduce((sum, item) => sum + item, 0);
    return subtotal * (1 + taxRate);
}