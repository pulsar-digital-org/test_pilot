#!/usr/bin/env node

export * from './core/discovery/index'

import packageJson from '../package.json' with { type: 'json' };

// Version info
export const VERSION = packageJson.version;