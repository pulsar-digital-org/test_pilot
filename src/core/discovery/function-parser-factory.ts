import type { AbstractParser } from '../../types/discovery';

export class ParserFactory {
    private static instance: ParserFactory;
    private parserCache = new Map<string, AbstractParser>();
    private parsers: AbstractParser[] = [];

    private constructor() {}

    static getInstance(): ParserFactory {
        if (!ParserFactory.instance) {
            ParserFactory.instance = new ParserFactory();
        }
        return ParserFactory.instance;
    }

    registerParser(parser: AbstractParser): void {
        this.parsers.push(parser);
        this.parserCache.clear();
    }

    getParser(filePath: string): AbstractParser | null {
        const extension = this.getFileExtension(filePath);
        
        if (this.parserCache.has(extension)) {
            const cachedParser = this.parserCache.get(extension);
            if (cachedParser) {
                return cachedParser;
            }
        }

        const parser = this.parsers.find(p => 
            p.getSupportedExtensions().includes(extension)
        );
        
        if (parser) {
            this.parserCache.set(extension, parser);
        }
        
        return parser || null;
    }

    private getFileExtension(filePath: string): string {
        const parts = filePath.split('.');
        return parts.length > 1 ? `.${parts.pop()?.toLowerCase() || ''}` : '';
    }

    getAvailableParsers(): readonly AbstractParser[] {
        return [...this.parsers];
    }
}