import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const preloadUrl = new URL('../electron/openfox-workflow-designer-preload.cjs', import.meta.url)
const preloadPath = fileURLToPath(preloadUrl)
const { createWorkflowTemplateCatalog, mainWorldWorkflowDesignerEnhancer } = require(preloadPath)

test('le catalogue fournit plusieurs modèles de workflows prêts à dupliquer', () => {
  const catalog = createWorkflowTemplateCatalog()
  assert.ok(Array.isArray(catalog))
  assert.ok(catalog.length >= 5)

  const ids = catalog.map((workflow) => workflow.metadata.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(ids.includes('ide-template-quick-fix'))
  assert.ok(ids.includes('ide-template-ui-playwright'))
  assert.ok(ids.includes('ide-template-safe-refactor'))
  assert.ok(ids.includes('ide-template-security-audit'))
  assert.ok(ids.includes('ide-template-git-delivery'))

  for (const workflow of catalog) {
    assert.ok(workflow.metadata.name)
    assert.ok(workflow.metadata.description)
    assert.ok(workflow.steps.length > 0)
    assert.ok(workflow.steps.some((step) => step.id === workflow.entryStep))

    const validTargets = new Set([...workflow.steps.map((step) => step.id), '$done', '$blocked'])
    for (const step of workflow.steps) {
      assert.ok(step.id)
      assert.ok(step.name)
      assert.ok(Array.isArray(step.transitions))
      for (const transition of step.transitions) {
        assert.ok(validTargets.has(transition.goto), `${workflow.metadata.id}: cible inconnue ${transition.goto}`)
      }
    }
  }
})

test('le designer permet le déplacement libre horizontal et vertical des blocs', async () => {
  const source = await readFile(preloadUrl, 'utf8')
  const enhancerSource = mainWorldWorkflowDesignerEnhancer.toString()

  assert.match(source, /document\.addEventListener\(['"]pointerdown['"]/)
  assert.match(source, /document\.addEventListener\(['"]pointermove['"]/)
  assert.match(source, /document\.addEventListener\(['"]pointerup['"]/)
  assert.match(source, /activeDrag\.baseX \+ deltaX/)
  assert.match(source, /activeDrag\.baseY \+ deltaY/)
  assert.match(source, /translate\(\$\{node\.dx\} \$\{node\.dy\}\)/)
  assert.match(source, /localStorage\.setItem\(storageKey\(model\.root\)/)
  assert.match(source, /localStorage\.getItem\(storageKey\(root\)/)
  assert.match(source, /updateEdges\(model\)/)
  assert.match(source, /Auto-layout/)
  assert.match(source, /Glisse les blocs/)

  assert.match(enhancerSource, /layoutPrefix/)
  assert.match(enhancerSource, /pointermove/)
  assert.match(enhancerSource, /saveLayout/)
})

test('le preload injecte le designer dans le monde principal de la page OpenFox locale', async () => {
  const source = await readFile(preloadUrl, 'utf8')
  assert.match(source, /contextBridge\?\.executeInMainWorld/)
  assert.match(source, /func:\s*mainWorldWorkflowDesignerEnhancer/)
  assert.match(source, /createWorkflowTemplateCatalog\(\)/)
  assert.match(source, /isLoopbackOpenFoxPage\(\)/)
  assert.doesNotMatch(source, /^import\s/m)
})
