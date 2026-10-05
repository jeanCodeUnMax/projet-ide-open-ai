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

test('the migration exposes all service boundaries without implementing Yfastos', async () => {
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
  assert.match(protocol, /start\(\): Promise<OpenFoxStatus>/);
  assert.match(protocol, /restart\(\): Promise<OpenFoxStatus>/);
  assert.match(protocol, /stop\(\): Promise<OpenFoxStatus>/);
});

test('Theia owns and embeds the existing OpenFox runtime', async () => {
  const runtime = await read('theia/packages/ide-ai-core/src/node/openfox-runtime.ts');
  const services = await read('theia/packages/ide-ai-core/src/node/ide-ai-backend-services.ts');
  const widget = await read('theia/packages/ide-ai-core/src/browser/ide-ai-widget.tsx');

  assert.match(runtime, /class ManagedOpenFoxRuntime/);
  assert.match(runtime, /127\.0\.0\.1/);
  assert.match(runtime, /--no-browser/);
  assert.match(runtime, /WORKSPACE_PATH/);
  assert.match(runtime, /api\/health/);
  assert.match(services, /runtime\.ensureStarted/);
  assert.match(services, /runtime\.restart/);
  assert.match(widget, /className="ide-ai-openfox-frame"/);
  assert.match(widget, /src=\{status\?\.baseUrl\}/);
  assert.doesNotMatch(widget, /Yfastos Contract/);
  assert.doesNotMatch(widget, /capacités IDE déclarées/);
});

test('heavy Theia workflows are manual and artifacts are short lived', async () => {
  const windowsWorkflow = await read('.github/workflows/theia-windows-desktop.yml');
  const spikeWorkflow = await read('.github/workflows/theia-spike.yml');

  assert.match(windowsWorkflow, /workflow_dispatch:/);
  assert.doesNotMatch(windowsWorkflow, /\n  push:/);
  assert.doesNotMatch(windowsWorkflow, /\n  pull_request:/);
  assert.match(windowsWorkflow, /IDE-AI-Setup-\*\.exe/);
  assert.match(windowsWorkflow, /retention-days: 1/);
  assert.match(spikeWorkflow, /workflow_dispatch:/);
  assert.doesNotMatch(spikeWorkflow, /\n  push:/);
});
