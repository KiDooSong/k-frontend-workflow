#!/usr/bin/env node
import { cliMain } from './lib/adoption-probe.mjs';
import { isCliEntry } from './lib/util.mjs';

if (isCliEntry(import.meta.url)) {
  cliMain(process.argv.slice(2));
}
