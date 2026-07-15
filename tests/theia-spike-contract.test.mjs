import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = relative => readFile(new URL(`../${relative}`, import.meta.url), 'utf8');

const appPackagePath = 'theia/applications/electron/package.json';
const extensionPackagePath = 'theia/packages/ide-ai-core/package.json';

test('the Theia product excludes Copilot and competing Theia orchestrators', async () => {
  const app = JSON.parse(await read(appPackagePath));
  assert.equal(app.theia.target, 'electron');
  assert.equal(app.dependencies['@theia/ai-copilot'], undefined);
  assert.equal(app.dependencies['@theia/ai-ide'], undefined);
  assert.equal(app.dependencies['@ide-ai/theia-core'], '0.1.0');
});

test('the IDE-AI package contributes frontend and backend modules', async () => {
  const extension = JSON.parse(await read(extensionPackagePath));
  assert.deepEqual(extension.theiaExtensions, [{
    frontend: 'lib/browser/frontend-module',
    backend: 'lib/node/backend-module',
  }]);
});

test('the migration spike exposes all required service boundaries', async () => {
  const protocol = await read('theia/packages/ide-ai-core/src/common/ide-ai-protocol.ts');
  const backend = await read('theia/packages/ide-ai-core/src/node/backend-module.ts');
  const frontend = await read('theia/packages/ide-ai-core/src/browser/frontend-module.ts');

  for (const service of [
    'IdeContextService',
    'OpenFoxBridgeService',
    'SecurityBridgeService',
    'MigrationService',
    'YfastosBridgeService',
  ]) {
    assert.match(protocol, new RegExp(`export const ${service}`));
    assert.match(backend, new RegExp(service));
    assert.match(frontend, new RegExp(service));
  }

  assert.match(backend, /JsonRpcConnectionHandler/);
  assert.match(frontend, /WebSocketConnectionProvider/);
});
