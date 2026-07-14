'use strict'

function isLoopbackOpenFoxPage() {
  return location.protocol === 'http:' && new Set(['127.0.0.1', 'localhost', '::1']).has(location.hostname)
}

function createWorkflowTemplateCatalog() {
  return [
    {
      metadata: {
        id: 'ide-template-quick-fix',
        name: 'Template — Correctif rapide',
        description: 'Boucle courte Builder → Verifier pour corriger un défaut ciblé avec critères mesurables.',
        version: '1.0.0',
        color: '#22c55e',
      },
      entryStep: 'build',
      settings: { maxIterations: 8 },
      startCondition: { type: 'always' },
      steps: [
        {
          id: 'build',
          name: 'Builder',
          type: 'agent',
          phase: 'build',
          agentId: 'builder',
          prompt: 'Analyse le défaut ciblé. Crée un critère avec session_metadata si aucun critère n’existe, corrige uniquement la cause racine, exécute les tests utiles, puis marque les critères concernés completed et appelle step_done().',
          nudgePrompt: 'Corrige les critères échoués à partir des retours du vérificateur, puis relance les tests ciblés.',
          transitions: [
            { when: { type: 'metadata_all_in', key: 'criteria', field: 'status', values: ['completed', 'passed'] }, goto: 'verify' },
            { when: { type: 'always' }, goto: 'build' },
          ],
        },
        {
          id: 'verify',
          name: 'Verifier',
          type: 'sub_agent',
          phase: 'verification',
          subAgentType: 'verifier',
          prompt: 'Vérifie les critères et les fichiers modifiés. Exécute les tests ciblés et mets chaque critère à passed ou failed avec session_metadata.',
          transitions: [
            { when: { type: 'metadata_all_match', key: 'criteria', field: 'status', value: 'passed' }, goto: '$done' },
            { when: { type: 'always' }, goto: 'build' },
          ],
        },
      ],
    },
    {
      metadata: {
        id: 'ide-template-ui-playwright',
        name: 'Template — Fonction UI + Playwright',
        description: 'Planification, réalisation UI, tests automatisés, inspection visuelle et vérification indépendante.',
        version: '1.0.0',
        color: '#8b5cf6',
      },
      entryStep: 'plan',
      settings: { maxIterations: 16 },
      startCondition: { type: 'always' },
      steps: [
        {
          id: 'plan',
          name: 'Planner',
          type: 'agent',
          phase: 'planning',
          agentId: 'planner',
          prompt: 'Explore la demande UI et le code concerné. Ajoute des critères fonctionnels, visuels, accessibilité et non-régression avec session_metadata, puis appelle step_done().',
          transitions: [{ when: { type: 'always' }, goto: 'build' }],
        },
        {
          id: 'build',
          name: 'Builder',
          type: 'agent',
          phase: 'build',
          agentId: 'builder',
          prompt: 'Implémente la fonctionnalité UI selon les critères. Ajoute ou adapte les tests. Marque les critères réalisés completed puis appelle step_done().',
          nudgePrompt: 'Corrige les échecs de tests ou de vérification UI sans élargir inutilement le périmètre.',
          transitions: [
            { when: { type: 'metadata_all_in', key: 'criteria', field: 'status', values: ['completed', 'passed'] }, goto: 'tests' },
            { when: { type: 'always' }, goto: 'build' },
          ],
        },
        {
          id: 'tests',
          name: 'Tests',
          type: 'shell',
          phase: 'verification',
          command: 'npm test',
          timeout: 180000,
          transitions: [
            { when: { type: 'step_result', result: 'success' }, goto: 'ui_test' },
            { when: { type: 'always' }, goto: 'build' },
          ],
        },
        {
          id: 'ui_test',
          name: 'Test UI',
          type: 'agent',
          phase: 'verification',
          agentId: 'builder',
          prompt: 'Charge le skill playwright-cli. Démarre le serveur si nécessaire, teste les parcours essentiels, le rendu, les erreurs console et les cas limites. Corrige les défauts simples puis appelle step_done().',
          transitions: [{ when: { type: 'always' }, goto: 'verify' }],
        },
        {
          id: 'verify',
          name: 'Verifier',
          type: 'sub_agent',
          phase: 'verification',
          subAgentType: 'verifier',
          prompt: 'Vérifie chaque critère marqué NEEDS VERIFICATION, le diff et les résultats de tests. Mets les critères à passed ou failed.',
          transitions: [
            { when: { type: 'metadata_all_match', key: 'criteria', field: 'status', value: 'passed' }, goto: '$done' },
            { when: { type: 'always' }, goto: 'build' },
          ],
        },
      ],
    },
    {
      metadata: {
        id: 'ide-template-safe-refactor',
        name: 'Template — Refactor sécurisé',
        description: 'Exploration, plan, refactor incrémental, tests et revue de code avec boucle de correction.',
        version: '1.0.0',
        color: '#06b6d4',
      },
      entryStep: 'explore',
      settings: { maxIterations: 18 },
      startCondition: { type: 'always' },
      steps: [
        {
          id: 'explore',
          name: 'Explorer',
          type: 'sub_agent',
          phase: 'planning',
          subAgentType: 'explorer',
          prompt: 'Cartographie les fichiers, dépendances, contrats publics, tests et risques de régression liés au refactor. Retourne une synthèse concise.',
          transitions: [{ when: { type: 'always' }, goto: 'plan' }],
        },
        {
          id: 'plan',
          name: 'Planner',
          type: 'agent',
          phase: 'planning',
          agentId: 'planner',
          prompt: 'Crée des critères et un plan de refactor incrémental. Préserve le comportement public et appelle step_done().',
          transitions: [{ when: { type: 'always' }, goto: 'build' }],
        },
        {
          id: 'build',
          name: 'Builder',
          type: 'agent',
          phase: 'build',
          agentId: 'builder',
          prompt: 'Réalise le refactor par petites étapes, garde les API compatibles, ajoute les tests manquants, marque les critères completed et appelle step_done().',
          nudgePrompt: 'Corrige uniquement les régressions ou constats de revue encore ouverts.',
          transitions: [
            { when: { type: 'metadata_all_in', key: 'criteria', field: 'status', values: ['completed', 'passed'] }, goto: 'tests' },
            { when: { type: 'always' }, goto: 'build' },
          ],
        },
        {
          id: 'tests',
          name: 'Tests',
          type: 'shell',
          phase: 'verification',
          command: 'npm test',
          timeout: 180000,
          transitions: [
            { when: { type: 'step_result', result: 'success' }, goto: 'review' },
            { when: { type: 'always' }, goto: 'build' },
          ],
        },
        {
          id: 'review',
          name: 'Code Reviewer',
          type: 'sub_agent',
          phase: 'verification',
          subAgentType: 'code_reviewer',
          prompt: 'Inspecte le git diff. Recherche régressions, duplications, couplages, complexité inutile et écarts aux conventions. Crée des review_findings ouverts.',
          transitions: [{ when: { type: 'always' }, goto: 'finalize' }],
        },
        {
          id: 'finalize',
          name: 'Finalize',
          type: 'agent',
          phase: 'verification',
          agentId: 'builder',
          prompt: 'Traite chaque review_finding. Mets-le à resolved ou dismissed, vérifie les tests et appelle step_done().',
          transitions: [
            { when: { type: 'metadata_all_in', key: 'review_findings', field: 'status', values: ['resolved', 'dismissed'] }, goto: '$done' },
            { when: { type: 'always' }, goto: 'finalize' },
          ],
        },
      ],
    },
    {
      metadata: {
        id: 'ide-template-security-audit',
        name: 'Template — Audit sécurité',
        description: 'Audit ciblé des secrets, entrées, permissions, dépendances et injections, puis remédiation vérifiée.',
        version: '1.0.0',
        color: '#ef4444',
      },
      entryStep: 'audit',
      settings: { maxIterations: 14 },
      startCondition: { type: 'always' },
      steps: [
        {
          id: 'audit',
          name: 'Security Review',
          type: 'sub_agent',
          phase: 'verification',
          subAgentType: 'code_reviewer',
          prompt: 'Audite secrets exposés, injections, traversées de chemin, permissions, dépendances, données personnelles et validation. Enregistre chaque problème dans review_findings avec statut open.',
          transitions: [{ when: { type: 'always' }, goto: 'remediate' }],
        },
        {
          id: 'remediate',
          name: 'Remediation',
          type: 'agent',
          phase: 'build',
          agentId: 'builder',
          prompt: 'Corrige les vulnérabilités confirmées avec le plus petit changement sûr, ajoute des tests et mets chaque finding à resolved ou dismissed. Appelle step_done().',
          nudgePrompt: 'Il reste des findings ouverts. Traite-les un par un et justifie les dismissals.',
          transitions: [
            { when: { type: 'metadata_all_in', key: 'review_findings', field: 'status', values: ['resolved', 'dismissed'] }, goto: 'tests' },
            { when: { type: 'always' }, goto: 'remediate' },
          ],
        },
        {
          id: 'tests',
          name: 'Security Tests',
          type: 'shell',
          phase: 'verification',
          command: 'npm test',
          timeout: 180000,
          transitions: [
            { when: { type: 'step_result', result: 'success' }, goto: '$done' },
            { when: { type: 'always' }, goto: 'remediate' },
          ],
        },
      ],
    },
    {
      metadata: {
        id: 'ide-template-git-delivery',
        name: 'Template — Tests, Commit & Push',
        description: 'Finalisation contrôlée : tests, revue du diff, corrections, commit ciblé et push.',
        version: '1.0.0',
        color: '#f59e0b',
      },
      entryStep: 'tests',
      settings: { maxIterations: 12 },
      startCondition: { type: 'always' },
      steps: [
        {
          id: 'tests',
          name: 'Tests',
          type: 'shell',
          phase: 'verification',
          command: 'npm test',
          timeout: 180000,
          transitions: [
            { when: { type: 'step_result', result: 'success' }, goto: 'review' },
            { when: { type: 'always' }, goto: 'fix' },
          ],
        },
        {
          id: 'fix',
          name: 'Fix Tests',
          type: 'agent',
          phase: 'build',
          agentId: 'builder',
          prompt: 'Analyse uniquement les tests en échec, corrige la cause racine, ne masque pas les erreurs et appelle step_done().',
          transitions: [{ when: { type: 'always' }, goto: 'tests' }],
        },
        {
          id: 'review',
          name: 'Code Reviewer',
          type: 'sub_agent',
          phase: 'verification',
          subAgentType: 'code_reviewer',
          prompt: 'Relis le git diff final. Vérifie sécurité, régressions, tests, fichiers accidentels et secrets. Crée des review_findings ouverts si nécessaire.',
          transitions: [{ when: { type: 'always' }, goto: 'finalize' }],
        },
        {
          id: 'finalize',
          name: 'Finalize',
          type: 'agent',
          phase: 'verification',
          agentId: 'builder',
          prompt: 'Résous ou dismiss tous les review_findings, relance les tests utiles, puis appelle step_done().',
          transitions: [
            { when: { type: 'metadata_all_in', key: 'review_findings', field: 'status', values: ['resolved', 'dismissed'] }, goto: 'git' },
            { when: { type: 'always' }, goto: 'finalize' },
          ],
        },
        {
          id: 'git',
          name: 'Commit & Push',
          type: 'agent',
          phase: 'build',
          agentId: 'builder',
          prompt: 'Exécute git status. Ajoute uniquement les fichiers liés à cette tâche, jamais git add -A. Crée un message clair, commit puis push. En cas de divergence, rebase proprement, résous les conflits et vérifie à nouveau les tests. Appelle step_done().',
          transitions: [{ when: { type: 'always' }, goto: '$done' }],
        },
      ],
    },
  ]
}

function mainWorldWorkflowDesignerEnhancer(templateCatalog) {
  if (window.__ideAiWorkflowDesignerInstalled || typeof window.fetch !== 'function') return false

  const templates = Array.isArray(templateCatalog) ? templateCatalog : []
  const templateById = new Map(templates.map((item) => [item?.metadata?.id, item]).filter(([id]) => typeof id === 'string'))
  const baseFetch = window.fetch.bind(window)
  const layoutPrefix = 'ide-ai:workflow-layout:'
  const models = new WeakMap()
  let activeDrag = null
  let scanTimer

  const jsonResponse = (body, response) => {
    const headers = new Headers(response?.headers)
    headers.set('content-type', 'application/json; charset=utf-8')
    return new Response(JSON.stringify(body), {
      status: response?.status ?? 200,
      statusText: response?.statusText ?? 'OK',
      headers,
    })
  }

  window.fetch = async function ideAiWorkflowTemplateFetch(input, init) {
    let url
    try {
      url = new URL(typeof input === 'string' ? input : input?.url, window.location.origin)
    } catch {
      return baseFetch(input, init)
    }
    const method = String(init?.method ?? input?.method ?? 'GET').toUpperCase()

    if (method === 'GET' && url.pathname === '/api/workflows') {
      const response = await baseFetch(input, init)
      if (!response.ok) return response
      try {
        const body = await response.clone().json()
        const existingIds = new Set([
          ...(body.defaults ?? []),
          ...(body.userItems ?? []),
          ...(body.projectItems ?? []),
        ].map((item) => item?.id).filter(Boolean))
        const virtualDefaults = templates
          .filter((template) => !existingIds.has(template.metadata.id))
          .map((template) => ({
            ...template.metadata,
            startCondition: template.startCondition,
            subGroups: [...new Set(template.steps.map((step) => step.subGroup).filter(Boolean))],
          }))
        return jsonResponse({ ...body, defaults: [...(body.defaults ?? []), ...virtualDefaults] }, response)
      } catch {
        return response
      }
    }

    if (method === 'GET') {
      const defaultMatch = url.pathname.match(/^\/api\/workflows\/defaults\/([^/]+)$/)
      const directMatch = url.pathname.match(/^\/api\/workflows\/([^/]+)$/)
      const id = decodeURIComponent(defaultMatch?.[1] ?? directMatch?.[1] ?? '')
      const template = templateById.get(id)
      if (template) return jsonResponse(template)
    }

    return baseFetch(input, init)
  }

  const directChildren = (element, tagName) => Array.from(element?.children ?? [])
    .filter((child) => child.tagName?.toLowerCase() === tagName)
  const numberAttr = (element, name) => Number(element.getAttribute(name) ?? 0)
  const currentPoint = (svg, event) => {
    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const matrix = svg.getScreenCTM()?.inverse()
    return matrix ? point.matrixTransform(matrix) : { x: 0, y: 0 }
  }
  const workflowRoot = (svg) => {
    let current = svg.parentElement
    while (current && current !== document.body) {
      const labels = Array.from(current.querySelectorAll('label'))
      const hasId = labels.some((label) => label.textContent?.trim() === 'ID')
      const hasAction = Array.from(current.querySelectorAll('button'))
        .some((button) => /^(Save|Save & Close|Duplicate & Customize)$/.test(button.textContent?.trim() ?? ''))
      if (hasId && hasAction) return current
      current = current.parentElement
    }
    return null
  }
  const workflowId = (root) => {
    const label = Array.from(root?.querySelectorAll('label') ?? [])
      .find((item) => item.textContent?.trim() === 'ID')
    return label?.parentElement?.querySelector('input')?.value?.trim() || '__new__'
  }
  const isEditable = (root) => Array.from(root?.querySelectorAll('button') ?? [])
    .some((button) => button.textContent?.trim() === 'Save')
  const storageKey = (root) => `${layoutPrefix}${workflowId(root)}`
  const readLayout = (root) => {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey(root)) || '{}')
      return parsed?.positions && typeof parsed.positions === 'object' ? parsed.positions : {}
    } catch {
      return {}
    }
  }
  const saveLayout = (model) => {
    const positions = {}
    for (const node of model.nodes) {
      if (!node.terminal && (Math.abs(node.dx) > 0.1 || Math.abs(node.dy) > 0.1)) {
        positions[node.key] = { x: Math.round(node.dx), y: Math.round(node.dy) }
      }
    }
    localStorage.setItem(storageKey(model.root), JSON.stringify({ version: 1, positions }))
  }
  const pathEndpoints = (path) => {
    const numbers = String(path?.getAttribute('d') ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
    return numbers.length >= 4
      ? { start: { x: numbers[0], y: numbers[1] }, end: { x: numbers.at(-2), y: numbers.at(-1) } }
      : null
  }
  const nodePort = (node, output, includeOffset = true) => ({
    x: node.x + node.width / 2 + (includeOffset ? node.dx : 0),
    y: node.y + (output ? node.height : 0) + (includeOffset ? node.dy : 0),
  })
  const nearestNode = (nodes, point, output, includeOffset = true) => {
    let best
    let distance = Number.POSITIVE_INFINITY
    for (const node of nodes) {
      const port = nodePort(node, output, includeOffset)
      const current = Math.hypot(port.x - point.x, port.y - point.y)
      if (current < distance) {
        best = node
        distance = current
      }
    }
    return best
  }
  const edgePath = (source, target) => {
    const from = nodePort(source, true)
    const to = nodePort(target, false)
    if (source.key === target.key) {
      const side = from.x + source.width / 2 + 45
      const top = source.y + source.dy - 30
      return {
        d: `M ${from.x} ${from.y} C ${side} ${from.y}, ${side} ${top}, ${from.x} ${top}`,
        labelX: side,
        labelY: top + 8,
      }
    }
    if (to.y >= from.y + 12) {
      const middle = from.y + (to.y - from.y) / 2
      return {
        d: `M ${from.x} ${from.y} C ${from.x} ${middle}, ${to.x} ${middle}, ${to.x} ${to.y}`,
        labelX: (from.x + to.x) / 2,
        labelY: middle - 5,
      }
    }
    const side = Math.max(from.x, to.x) + 70
    const top = Math.min(from.y, to.y) - 36
    return {
      d: `M ${from.x} ${from.y} L ${side} ${from.y} L ${side} ${top} L ${to.x} ${top} L ${to.x} ${to.y}`,
      labelX: side + 5,
      labelY: (from.y + top) / 2,
    }
  }
  const updateEdges = (model) => {
    for (const edge of model.edges) {
      const source = model.nodeByKey.get(edge.sourceKey)
      const target = model.nodeByKey.get(edge.targetKey)
      if (!source || !target) continue
      const next = edgePath(source, target)
      for (const path of edge.paths) path.setAttribute('d', next.d)
      if (edge.label) {
        edge.label.setAttribute('x', String(next.labelX))
        edge.label.setAttribute('y', String(next.labelY))
      }
    }
  }
  const applyNode = (node) => node.group.setAttribute('transform', `translate(${node.dx} ${node.dy})`)
  const resetLayout = (model) => {
    localStorage.removeItem(storageKey(model.root))
    for (const node of model.nodes) {
      node.dx = 0
      node.dy = 0
      applyNode(node)
    }
    updateEdges(model)
  }
  const addToolbar = (model) => {
    const flowLabel = Array.from(model.root.querySelectorAll('span'))
      .find((element) => element.textContent?.trim() === 'Flow')
    const header = flowLabel?.parentElement
    if (!header) return
    const existing = header.querySelector('[data-ide-ai-workflow-layout]')
    if (existing) {
      existing.__ideAiWorkflowModel = model
      return
    }
    const controls = document.createElement('div')
    controls.dataset.ideAiWorkflowLayout = 'true'
    controls.__ideAiWorkflowModel = model
    Object.assign(controls.style, { display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' })
    const hint = document.createElement('span')
    hint.textContent = model.editable ? '↔ Glisse les blocs' : 'Disposition enregistrée'
    Object.assign(hint.style, { fontSize: '10px', color: '#8b949e' })
    const reset = document.createElement('button')
    reset.type = 'button'
    reset.textContent = 'Auto-layout'
    reset.title = 'Réinitialiser la position automatique des blocs'
    Object.assign(reset.style, {
      fontSize: '10px',
      color: '#58a6ff',
      background: 'transparent',
      border: '1px solid #30363d',
      borderRadius: '4px',
      padding: '2px 6px',
      cursor: 'pointer',
    })
    reset.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      resetLayout(controls.__ideAiWorkflowModel ?? model)
    })
    controls.append(hint, reset)
    const addStep = Array.from(header.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Add Step'))
    if (addStep) header.insertBefore(controls, addStep)
    else header.appendChild(controls)
  }
  const buildModel = (svg) => {
    const root = workflowRoot(svg)
    if (!root) return null
    const positions = readLayout(root)
    const groups = directChildren(svg, 'g')
    const counts = new Map()
    const nodes = []

    for (const group of groups) {
      const rects = directChildren(group, 'rect')
      const text = directChildren(group, 'text')[0]
      if (!text || rects.length === 0 || directChildren(group, 'path').length > 0) continue
      const label = text.textContent?.trim()
      if (!label) continue
      const mainRect = rects.find((rect) => rect.getAttribute('fill') && rect.getAttribute('fill') !== 'none')
        ?? rects.at(-1)
      if (!mainRect) continue
      const occurrence = counts.get(label) ?? 0
      counts.set(label, occurrence + 1)
      const key = `${label}#${occurrence}`
      const saved = positions[key] ?? {}
      const node = {
        key,
        label,
        group,
        terminal: label === 'Start' || label === 'Done' || label === 'Blocked',
        x: numberAttr(mainRect, 'x'),
        y: numberAttr(mainRect, 'y'),
        width: numberAttr(mainRect, 'width'),
        height: numberAttr(mainRect, 'height'),
        dx: Number(saved.x) || 0,
        dy: Number(saved.y) || 0,
      }
      group.dataset.ideAiNodeKey = key
      group.dataset.ideAiNodeTerminal = String(node.terminal)
      if (!node.terminal && isEditable(root)) group.style.cursor = 'move'
      applyNode(node)
      nodes.push(node)
    }

    if (nodes.length < 2) return null
    const nodeByKey = new Map(nodes.map((node) => [node.key, node]))
    const edges = []
    for (const group of groups) {
      const paths = directChildren(group, 'path').filter((path) => path.getAttribute('d'))
      if (paths.length === 0) continue
      const endpoints = pathEndpoints(paths[0])
      if (!endpoints) continue
      const source = nodeByKey.get(group.dataset.ideAiEdgeSource)
        ?? nearestNode(nodes, endpoints.start, true, false)
      const target = nodeByKey.get(group.dataset.ideAiEdgeTarget)
        ?? nearestNode(nodes, endpoints.end, false, false)
      if (!source || !target) continue
      group.dataset.ideAiEdgeSource = source.key
      group.dataset.ideAiEdgeTarget = target.key
      edges.push({
        paths,
        label: directChildren(group, 'text')[0],
        sourceKey: source.key,
        targetKey: target.key,
      })
    }

    const model = { svg, root, editable: isEditable(root), nodes, nodeByKey, edges }
    models.set(svg, model)
    svg.style.touchAction = 'none'
    addToolbar(model)
    updateEdges(model)
    return model
  }
  const isWorkflowSvg = (svg) => {
    const labels = directChildren(svg, 'g')
      .flatMap((group) => directChildren(group, 'text').map((text) => text.textContent?.trim()))
    return labels.includes('Start') && labels.includes('Done')
  }
  const scan = () => {
    if (activeDrag) return
    for (const svg of document.querySelectorAll('svg')) {
      if (isWorkflowSvg(svg)) buildModel(svg)
    }
  }
  const scheduleScan = () => {
    window.clearTimeout(scanTimer)
    scanTimer = window.setTimeout(scan, 60)
  }

  document.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !(event.target instanceof Element)) return
    const group = event.target.closest('g[data-ide-ai-node-key]')
    const svg = group?.ownerSVGElement
    const model = svg ? models.get(svg) : null
    const node = model?.nodeByKey.get(group?.dataset.ideAiNodeKey)
    if (!model?.editable || !node || node.terminal) return
    if (event.target.tagName?.toLowerCase() === 'circle' || event.target.closest('g') !== group) return
    const point = currentPoint(svg, event)
    activeDrag = {
      model,
      node,
      startX: point.x,
      startY: point.y,
      baseX: node.dx,
      baseY: node.dy,
      moved: false,
      pointerId: event.pointerId,
    }
    group.style.cursor = 'grabbing'
    event.preventDefault()
    event.stopPropagation()
  }, true)

  document.addEventListener('pointermove', (event) => {
    if (!activeDrag || event.pointerId !== activeDrag.pointerId) return
    const { model, node } = activeDrag
    const point = currentPoint(model.svg, event)
    const deltaX = point.x - activeDrag.startX
    const deltaY = point.y - activeDrag.startY
    const viewBox = model.svg.viewBox.baseVal
    node.dx = Math.max(6 - node.x, Math.min(viewBox.width - node.x - node.width - 6, activeDrag.baseX + deltaX))
    node.dy = Math.max(6 - node.y, Math.min(viewBox.height - node.y - node.height - 6, activeDrag.baseY + deltaY))
    activeDrag.moved ||= Math.abs(deltaX) + Math.abs(deltaY) > 3
    applyNode(node)
    updateEdges(model)
    event.preventDefault()
    event.stopPropagation()
  }, true)

  const endDrag = (event) => {
    if (!activeDrag || event.pointerId !== activeDrag.pointerId) return
    const finished = activeDrag
    activeDrag = null
    finished.node.group.style.cursor = 'move'
    saveLayout(finished.model)
    updateEdges(finished.model)
    if (finished.moved) {
      event.preventDefault()
      event.stopPropagation()
    }
    scheduleScan()
  }
  document.addEventListener('pointerup', endDrag, true)
  document.addEventListener('pointercancel', endDrag, true)

  const startObserver = () => {
    new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true })
    scan()
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startObserver, { once: true })
  else startObserver()

  Object.defineProperty(window, '__ideAiWorkflowDesignerInstalled', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  })
  return true
}

function installWorkflowDesigner() {
  try {
    const { contextBridge, webFrame } = require('electron')
    const catalog = createWorkflowTemplateCatalog()
    if (typeof contextBridge?.executeInMainWorld === 'function') {
      contextBridge.executeInMainWorld({ func: mainWorldWorkflowDesignerEnhancer, args: [catalog] })
      return true
    }
    if (typeof webFrame?.executeJavaScript === 'function') {
      void webFrame.executeJavaScript(
        `(${mainWorldWorkflowDesignerEnhancer.toString()})(${JSON.stringify(catalog)})`,
        true,
      )
      return true
    }
  } catch (error) {
    console.error('[IDE-AI] Designer de workflows OpenFox indisponible.', error)
  }
  return false
}

try {
  if (isLoopbackOpenFoxPage()) installWorkflowDesigner()
} catch {
  // Les fenêtres file:// et les pages non OpenFox n’exposent pas toujours location/DOM.
}

module.exports = {
  createWorkflowTemplateCatalog,
  mainWorldWorkflowDesignerEnhancer,
}
