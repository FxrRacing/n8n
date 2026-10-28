import { cp } from 'node:fs/promises';

// Copy node icons and codex metadata into dist so n8n can serve them
await cp('nodes/NetSuite/netsuite.svg', 'dist/nodes/NetSuite/netsuite.svg');
await cp('nodes/NetSuite/NetSuite.node.json', 'dist/nodes/NetSuite/NetSuite.node.json');
console.log('Assets copied to dist');