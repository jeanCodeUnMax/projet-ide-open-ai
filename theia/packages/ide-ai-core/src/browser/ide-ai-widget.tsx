import { ReactWidget } from '@theia/core/lib/browser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import React from '@theia/core/shared/react';
import {
  IdeContextService,
  IdeContextSnapshot,
  MigrationService,
  MigrationStatus,
  OpenFoxBridgeService,
  OpenFoxStatus,
  SecurityBridgeService,
  SecurityStatus,
  ServiceHealth,
  YfastosBridgeService,
  YfastosStatus,
} from '../common/ide-ai-protocol';

@injectable()
export class IdeAiWidget extends ReactWidget {
  static readonly ID = 'ide-ai.openfox';
  static readonly LABEL = 'OpenFox';

  @inject(IdeContextService)
  protected readonly ideContext!: IdeContextService;

  @inject(OpenFoxBridgeService)
  protected readonly openFox!: OpenFoxBridgeService;

  @inject(SecurityBridgeService)
  protected readonly security!: SecurityBridgeService;

  @inject(MigrationService)
  protected readonly migration!: MigrationService;

  @inject(YfastosBridgeService)
  protected readonly yfastos!: YfastosBridgeService;

  protected snapshot?: IdeContextSnapshot;
  protected openFoxStatus?: OpenFoxStatus;
  protected securityStatus?: SecurityStatus;
  protected migrationStatus?: MigrationStatus;
  protected yfastosStatus?: YfastosStatus;
  protected loading = false;
  protected error?: string;

  @postConstruct()
  protected init(): void {
    this.id = IdeAiWidget.ID;
    this.title.label = IdeAiWidget.LABEL;
    this.title.caption = 'OpenFox — orchestration IDE-AI';
    this.title.iconClass = 'codicon codicon-sparkle';
    this.title.closable = true;
    this.node.tabIndex = 0;
    this.addClass('ide-ai-widget');
    void this.refresh();
  }

  protected async refresh(): Promise<void> {
    if (this.loading) {
      return;
    }
    this.loading = true;
    this.error = undefined;
    this.update();
    try {
      const [snapshot, openFoxStatus, securityStatus, migrationStatus, yfastosStatus] = await Promise.all([
        this.ideContext.snapshot(),
        this.openFox.status(),
        this.security.status(),
        this.migration.status(),
        this.yfastos.status(),
      ]);
      this.snapshot = snapshot;
      this.openFoxStatus = openFoxStatus;
      this.securityStatus = securityStatus;
      this.migrationStatus = migrationStatus;
      this.yfastosStatus = yfastosStatus;
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.loading = false;
      this.update();
    }
  }

  protected serviceCard(label: string, status: ServiceHealth | undefined, details?: React.ReactNode): React.ReactNode {
    const state = status?.state ?? 'offline';
    return (
      <section className={`ide-ai-service-card state-${state}`}>
        <header>
          <span className="ide-ai-state-dot" aria-hidden="true" />
          <strong>{label}</strong>
          <span className="ide-ai-state-label">{state}</span>
        </header>
        <p>{status?.message ?? 'État non disponible'}</p>
        {details}
      </section>
    );
  }

  protected render(): React.ReactNode {
    return (
      <div className="ide-ai-dashboard">
        <div className="ide-ai-dashboard-header">
          <div>
            <h2>IDE-AI / OpenFox</h2>
            <p>Services natifs de la migration Eclipse Theia.</p>
          </div>
          <button className="theia-button secondary" disabled={this.loading} onClick={() => void this.refresh()}>
            {this.loading ? 'Actualisation…' : 'Actualiser'}
          </button>
        </div>

        {this.error && <div className="ide-ai-error">{this.error}</div>}

        <section className="ide-ai-context-card">
          <span className="ide-ai-eyebrow">WORKSPACE ACTIF</span>
          <strong>{this.snapshot?.workspace.name ?? 'Aucun workspace'}</strong>
          <code>{this.snapshot?.workspace.uri ?? 'Ouvre un dossier dans Theia.'}</code>
          <small>{this.snapshot?.capabilities.length ?? 0} capacités IDE déclarées</small>
        </section>

        <div className="ide-ai-service-grid">
          {this.serviceCard('OpenFox Bridge', this.openFoxStatus,
            <code>{this.openFoxStatus?.baseUrl}</code>)}
          {this.serviceCard('Security Gate', this.securityStatus,
            <small>Mode : {this.securityStatus?.mode ?? 'inconnu'} · Gate : {this.securityStatus?.gateEnabled ? 'active' : 'observation'}</small>)}
          {this.serviceCard('Migration', this.migrationStatus,
            <small>Schéma : v{this.migrationStatus?.schemaVersion ?? 1}</small>)}
          {this.serviceCard('Yfastos Contract', this.yfastosStatus,
            <code>{this.yfastosStatus?.endpoint ?? 'non configuré'}</code>)}
        </div>

        <section className="ide-ai-next-step">
          <strong>Prochain portage</strong>
          <span>Connecter le runtime OpenFox existant au backend Theia, puis alimenter le Context Bridge avec éditeurs, diagnostics, Git, terminal, tâches, tests et mini-browser.</span>
        </section>
      </div>
    );
  }
}
