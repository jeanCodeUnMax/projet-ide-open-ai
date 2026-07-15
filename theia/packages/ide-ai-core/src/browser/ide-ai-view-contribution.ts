import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { injectable } from '@theia/core/shared/inversify';
import { IdeAiWidget } from './ide-ai-widget';

@injectable()
export class IdeAiViewContribution extends AbstractViewContribution<IdeAiWidget> {
  static readonly TOGGLE_COMMAND_ID = 'ide-ai.openfox.toggle';

  constructor() {
    super({
      widgetId: IdeAiWidget.ID,
      widgetName: IdeAiWidget.LABEL,
      toggleCommandId: IdeAiViewContribution.TOGGLE_COMMAND_ID,
      defaultWidgetOptions: {
        area: 'right',
        rank: 100,
      },
    });
  }
}
