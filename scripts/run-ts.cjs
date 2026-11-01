require('./ts-register.cjs');
const path = require('node:path');
const file = process.argv[2];
if (!file) throw new Error('Usage: node scripts/run-ts.cjs path/to/script.ts [args]');
process.argv.splice(1, 1);
require(path.resolve(file));
