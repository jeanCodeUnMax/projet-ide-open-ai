import { ReactWidget } from '@theia/core/lib/browser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import React from '@theia/core/shared/react';
import {
  IdeContextService,
  IdeContextSnapshot,
  OpenFoxBridgeService,
  OpenFoxStatus,
} from '../common/ide-ai-protocol';

@injectable()
export class IdeAiWidget extends ReactWidget {
  static readonly ID = 'ide-ai.openfox';
  static readonly LABEL = 'OpenFox';

  @inject(IdeContextService)
  protected readonly ideContext!: IdeContextService;

  @inject(OpenFoxBridgeService)
  protected readonly openFox!: OpenFoxBridgeService;

  protected snapshot?: IdeContextSnapshot;
  protected openFoxStatus?: OpenFoxStatus;
  protected loading = false;
  protected error?: string;
  protected frameRevision = 0;

  @postConstruct()
  protected init(): void {
    this.id = IdeAiWidget.ID;
    this.title.label = IdeAiWidget.LABEL;
    this.title.caption = 'OpenFox — assistant agentique IDE-AI';
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
      const [snapshot, openFoxStatus] = await Promise.all([
        this.ideContext.snapshot(),
        this.openFox.status(),
      ]);
      this.snapshot = snapshot;
      this.openFoxStatus = openFoxStatus;
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.loading = false;
      this.update();
    }
  }

  protected async restart(): Promise<void> {
    if (this.loading) {
      return;
    }
    this.loading = true;
    this.error = undefined;
    this.update();
    try {
      this.openFoxStatus = await this.openFox.restart();
      this.snapshot = await this.ideContext.snapshot();
      this.frameRevision += 1;
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.loading = false;
      this.update();
    }
  }

  protected reloadFrame(): void {
    this.frameRevision += 1;
    this.update();
  }

  protected render(): React.ReactNode {
    const status = this.openFoxStatus;
    const ready = status?.state === 'ready' && Boolean(status.baseUrl);
    const workspaceName = this.snapshot?.workspace.name ?? 'Aucun workspace';

    return (
      <div className="ide-ai-openfox-shell">
        <header className="ide-ai-openfox-toolbar">
          <div className="ide-ai-openfox-identity">
            <span className={`ide-ai-state-dot state-${status?.state ?? 'offline'}`} aria-hidden="true" />
            <div>
              <strong>OpenFox</strong>
              <small>{workspaceName} · {status?.message ?? 'Initialisation…'}</small>
            </div>
          </div>
          <div className="ide-ai-openfox-actions">
            <button className="theia-button secondary" disabled={this.loading || !ready} onClick={() => this.reloadFrame()}>
              Recharger
            </button>
            <button className="theia-button" disabled={this.loading} onClick={() => void this.restart()}>
              {this.loading ? 'Démarrage…' : 'Redémarrer'}
            </button>
          </div>
        </header>

        {this.error && <div className="ide-ai-error">{this.error}</div>}

        {ready ? (
          <iframe
            key={`${status?.baseUrl}-${this.frameRevision}`}
            className="ide-ai-openfox-frame"
            src={status?.baseUrl}
            title="OpenFox"
            allow="clipboard-read; clipboard-write"
            referrerPolicy="no-referrer"
          />
        ) : (
          <section className="ide-ai-openfox-startup">
            <span className="codicon codicon-loading codicon-modifier-spin" aria-hidden="true" />
            <h2>{this.loading ? 'Démarrage d’OpenFox' : 'OpenFox indisponible'}</h2>
            <p>{status?.message ?? 'Theia prépare le runtime OpenFox et le workspace actif.'}</p>
            {status?.logsTail && <pre>{status.logsTail}</pre>}
            {!this.loading && (
              <button className="theia-button" onClick={() => void this.refresh()}>
                Démarrer OpenFox
              </button>
            )}
          </section>
        )}
      </div>
    );
  }
}
