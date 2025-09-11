#!/usr/bin/env node

export * from './core/discovery/index'

import packageJson from '../package.json' with { type: 'json' };
import { Discovery } from './core/discovery/index';

// Version info
export const VERSION = packageJson.version;

const d = new Discovery('../test_pilot');
d.discover();