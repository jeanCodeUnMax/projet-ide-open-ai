import { ConnectionHandler, JsonRpcConnectionHandler } from '@theia/core/lib/common/messaging';
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
import {
  IdeContextServiceImpl,
  MigrationServiceImpl,
  OpenFoxBridgeServiceImpl,
  SecurityBridgeServiceImpl,
  YfastosBridgeServiceImpl,
} from './ide-ai-backend-services';

export default new ContainerModule(bind => {
  bind(IdeContextServiceImpl).toSelf().inSingletonScope();
  bind(IdeContextService).toService(IdeContextServiceImpl);
  bind(ConnectionHandler).toDynamicValue(ctx =>
    new JsonRpcConnectionHandler(ideContextServicePath, () => ctx.container.get<IdeContextService>(IdeContextService)),
  ).inSingletonScope();

  bind(OpenFoxBridgeServiceImpl).toSelf().inSingletonScope();
  bind(OpenFoxBridgeService).toService(OpenFoxBridgeServiceImpl);
  bind(ConnectionHandler).toDynamicValue(ctx =>
    new JsonRpcConnectionHandler(openFoxBridgeServicePath, () => ctx.container.get<OpenFoxBridgeService>(OpenFoxBridgeService)),
  ).inSingletonScope();

  bind(SecurityBridgeServiceImpl).toSelf().inSingletonScope();
  bind(SecurityBridgeService).toService(SecurityBridgeServiceImpl);
  bind(ConnectionHandler).toDynamicValue(ctx =>
    new JsonRpcConnectionHandler(securityBridgeServicePath, () => ctx.container.get<SecurityBridgeService>(SecurityBridgeService)),
  ).inSingletonScope();

  bind(MigrationServiceImpl).toSelf().inSingletonScope();
  bind(MigrationService).toService(MigrationServiceImpl);
  bind(ConnectionHandler).toDynamicValue(ctx =>
    new JsonRpcConnectionHandler(migrationServicePath, () => ctx.container.get<MigrationService>(MigrationService)),
  ).inSingletonScope();

  bind(YfastosBridgeServiceImpl).toSelf().inSingletonScope();
  bind(YfastosBridgeService).toService(YfastosBridgeServiceImpl);
  bind(ConnectionHandler).toDynamicValue(ctx =>
    new JsonRpcConnectionHandler(yfastosBridgeServicePath, () => ctx.container.get<YfastosBridgeService>(YfastosBridgeService)),
  ).inSingletonScope();
});
