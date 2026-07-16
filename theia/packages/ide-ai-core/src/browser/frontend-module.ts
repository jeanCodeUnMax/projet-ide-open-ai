import {
  FrontendApplicationContribution,
  WidgetFactory,
  WebSocketConnectionProvider,
  bindViewContribution,
} from '@theia/core/lib/browser';
import { ContainerModule } from '@theia/core/shared/inversify';
import {
  IdeContextService,
  MigrationService,
  OpenFoxBridgeService,
  SecurityBridgeService,
  YfastosBridgeService,
  ideContextServicePath,
  migrationServicePath,
  openFoxBridgeServicePath,
  securityBridgeServicePath,
  yfastosBridgeServicePath,
} from '../common/ide-ai-protocol';
import { IdeAiViewContribution } from './ide-ai-view-contribution';
import { IdeAiWidget } from './ide-ai-widget';
import './style/ide-ai.css';

export default new ContainerModule(bind => {
  bind(IdeContextService).toDynamicValue(ctx =>
    ctx.container.get(WebSocketConnectionProvider).createProxy<IdeContextService>(ideContextServicePath),
  ).inSingletonScope();

  bind(OpenFoxBridgeService).toDynamicValue(ctx =>
    ctx.container.get(WebSocketConnectionProvider).createProxy<OpenFoxBridgeService>(openFoxBridgeServicePath),
  ).inSingletonScope();

  bind(SecurityBridgeService).toDynamicValue(ctx =>
    ctx.container.get(WebSocketConnectionProvider).createProxy<SecurityBridgeService>(securityBridgeServicePath),
  ).inSingletonScope();

  bind(MigrationService).toDynamicValue(ctx =>
    ctx.container.get(WebSocketConnectionProvider).createProxy<MigrationService>(migrationServicePath),
  ).inSingletonScope();

  bind(YfastosBridgeService).toDynamicValue(ctx =>
    ctx.container.get(WebSocketConnectionProvider).createProxy<YfastosBridgeService>(yfastosBridgeServicePath),
  ).inSingletonScope();

  bindViewContribution(bind, IdeAiViewContribution);
  bind(FrontendApplicationContribution).toService(IdeAiViewContribution);
  bind(IdeAiWidget).toSelf();
  bind(WidgetFactory).toDynamicValue(ctx => ({
    id: IdeAiWidget.ID,
    createWidget: () => ctx.container.get(IdeAiWidget),
  })).inSingletonScope();
});
