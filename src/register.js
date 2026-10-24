// Registration logic, kept free of Builder.io imports so tests can pass in a
// fake Builder and a fake editor state.
import {
  DEFAULT_API_BASE,
  dataWithWidget,
  dataWithoutWidget,
  hasWidget,
  normalizeWidgetId,
  syncPage,
} from './core.js';

export const PLUGIN_ID = '@asyntai/builder-plugin-ai-chatbot';

export function getSettings(state) {
  let map = null;
  try {
    map = state.user.organization.value.settings.plugins.get(PLUGIN_ID);
  } catch (e) {
    map = null;
  }
  const read = (key) => {
    if (!map) return '';
    const v = typeof map.get === 'function' ? map.get(key) : map[key];
    return v == null ? '' : String(v).trim();
  };
  return {
    widgetId: normalizeWidgetId(read('widgetId')),
    apiKey: read('apiKey'),
    websiteId: read('websiteId'),
  };
}

function notify(state, message) {
  try {
    state.snackBar.show(message);
  } catch (e) {
    // Older editors without a snack bar: fall back to a dialog.
    try { state.dialogs.alert(message); } catch (e2) { /* nothing else to try */ }
  }
}

// Pages and sections ("component" models) render blocks on the live site;
// data models do not.
function canHoldWidget(model) {
  return !!model && (model.kind === 'page' || model.kind === 'component');
}

export function register(builder, state, fetchImpl = (...a) => fetch(...a), apiBase = DEFAULT_API_BASE) {
  builder.register('plugin', {
    id: PLUGIN_ID,
    name: 'Asyntai AI Chatbot',
    settings: [
      {
        name: 'widgetId',
        friendlyName: 'Asyntai widget ID',
        type: 'string',
        required: true,
        helperText: 'Asyntai dashboard > Install. It looks like asyntai_1a2b3c4d5e6f. No account yet? Create one free at asyntai.com.',
      },
      {
        name: 'apiKey',
        friendlyName: 'Asyntai API key (optional)',
        type: 'password',
        required: false,
        helperText: 'Only for "Add to Asyntai knowledge base". Get it at asyntai.com/settings/api/ (paid plans). It stays in the Builder editor and is never put on your site.',
      },
      {
        name: 'websiteId',
        friendlyName: 'Asyntai website ID (optional)',
        type: 'string',
        required: false,
        advanced: true,
        helperText: 'Only if your Asyntai account has more than one website. Empty = your main website.',
      },
    ],
    ctaText: 'Save Asyntai settings',
    onSave: async () => {
      const s = getSettings(state);
      notify(state, s.widgetId
        ? 'Asyntai is connected. Open a page or section, then use the ... menu > Add Asyntai AI Chatbot here.'
        : 'Enter a valid Asyntai widget ID, for example asyntai_1a2b3c4d5e6f.');
    },
  });

  builder.register('app.onLoad', async ({ triggerSettingsDialog }) => {
    if (!getSettings(state).widgetId && typeof triggerSettingsDialog === 'function') {
      await triggerSettingsDialog(PLUGIN_ID);
    }
  });

  builder.register('content.action', {
    label: 'Add Asyntai AI Chatbot here',
    showIf(content, model) {
      return canHoldWidget(model) && !hasWidget(content);
    },
    async onClick(content) {
      const { widgetId } = getSettings(state);
      if (!widgetId) {
        notify(state, 'Add your Asyntai widget ID in Settings > Plugins > Asyntai AI Chatbot first.');
        return;
      }
      await state.updateLatestDraft({
        id: content.id,
        modelId: content.modelId,
        data: dataWithWidget(content, widgetId),
      });
      notify(state, 'Asyntai AI Chatbot added. Publish to show the chat on your site.');
    },
  });

  builder.register('content.action', {
    label: 'Remove Asyntai AI Chatbot',
    showIf(content, model) {
      return canHoldWidget(model) && hasWidget(content);
    },
    async onClick(content) {
      await state.updateLatestDraft({
        id: content.id,
        modelId: content.modelId,
        data: dataWithoutWidget(content),
      });
      notify(state, 'Asyntai AI Chatbot removed. Publish to apply it.');
    },
  });

  const syncOne = (content) => {
    const { apiKey, websiteId } = getSettings(state);
    return syncPage(content, { apiKey, websiteId, fetchImpl, base: apiBase });
  };

  builder.register('content.action', {
    label: 'Add to Asyntai knowledge base',
    showIf(content, model) {
      return !!model && model.kind !== 'data' && !!getSettings(state).apiKey;
    },
    async onClick(content) {
      try {
        const r = await syncOne(content);
        notify(state, (r.replaced ? 'Updated' : 'Added') + ' "' + r.title + '" in your Asyntai knowledge base.');
      } catch (e) {
        notify(state, 'Asyntai: ' + e.message);
      }
    },
  });

  builder.register('content.bulkAction', {
    label: 'Add to Asyntai knowledge base',
    showIf(ids, contents, model) {
      return !!model && model.kind !== 'data' && !!getSettings(state).apiKey && (ids || []).length > 0;
    },
    async onClick(actions, ids, contents) {
      const wanted = new Set(ids || []);
      const list = (contents || []).filter((c) => c && (!wanted.size || wanted.has(c.id)));
      let ok = 0;
      const failed = [];
      for (const content of list) {
        try {
          await syncOne(content);
          ok += 1;
        } catch (e) {
          failed.push((content.name || content.id) + ': ' + e.message);
        }
      }
      notify(state, 'Asyntai: ' + ok + ' of ' + list.length + ' added to the knowledge base.' +
        (failed.length ? ' Not added: ' + failed.join('; ') : ''));
      if (actions && typeof actions.refreshList === 'function') actions.refreshList();
    },
  });
}
