#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { cliMain } from './lib/adoption-probe.mjs';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cliMain(process.argv.slice(2));
}
