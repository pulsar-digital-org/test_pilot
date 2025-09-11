import { readFile, access, constants } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import type { IFileSystem } from './analysis/types';

const DEFAULT_TIMEOUT = 5000;

export class FileSystemService implements IFileSystem {
    constructor(private readonly timeout: number = DEFAULT_TIMEOUT) {}

    async readFile(path: string): Promise<string> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const content = await readFile(path, 'utf-8');
            return content;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    async exists(path: string): Promise<boolean> {
        try {
            await access(path, constants.R_OK);
            return true;
        } catch {
            return false;
        }
    }

    resolvePath(basePath: string, relativePath: string): string {
        if (relativePath.startsWith('.')) {
            return resolve(dirname(basePath), relativePath);
        }
        return resolve(relativePath);
    }
}