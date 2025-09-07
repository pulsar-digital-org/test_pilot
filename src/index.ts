#!/usr/bin/env node

import packageJson from '../package.json' with { type: 'json' };

// Version info
export const VERSION = packageJson.version;

console.log(VERSION);