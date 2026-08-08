#!/usr/bin/env node

import { runCliExecutable } from "./cli.js";

process.exitCode = await runCliExecutable(process.argv.slice(2));
