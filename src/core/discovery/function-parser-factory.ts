import type { AbstractParser } from '../../types/discovery';

export class ParserFactory {
    private static instance: ParserFactory;
    private parsers: AbstractParser[] = [];

    private constructor() {    }

    static getInstance(): ParserFactory {
        if (!ParserFactory.instance) {
            ParserFactory.instance = new ParserFactory();
        }
        return ParserFactory.instance;
    }

    registerParser(parser: AbstractParser): void {
        this.parsers.push(parser);
    }

    getParser(filePath: string): AbstractParser | undefined {
        const extension = this.getFileExtension(filePath);

        return this.parsers.find(p => 
            p.getSupportedExtensions().includes(extension)
        );
    }

    private getFileExtension(filePath: string): string {
        const parts = filePath.split('.');
        return parts.length > 1 ? `.${parts.pop()?.toLowerCase() || ''}` : '';
    }

    getAvailableParsers(): readonly AbstractParser[] {
        return [...this.parsers];
    }
}