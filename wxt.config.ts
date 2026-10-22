import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'savEEZE',
    description: 'See if a store is charging you more than everyone else. One fair price, for everyone.',
    permissions: ['activeTab', 'scripting', 'storage'],
    action: { default_title: 'savEEZE: check this price' },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'saveeze@eeze.app',
              strict_min_version: '128.0',
              data_collection_permissions: { required: ['none'] },
            },
          },
        }
      : {}),
  }),
  hooks: {
    'build:manifestGenerated': (wxt, manifest) => {
      // e2e builds can reach the fake test store, so tests run without a real click on the toolbar
      if (wxt.config.mode === 'e2e') manifest.host_permissions = ['http://shop.test/*'];
      else delete manifest.host_permissions;
    },
  },
});
