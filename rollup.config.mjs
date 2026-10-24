import { nodeResolve } from '@rollup/plugin-node-resolve';
import serve from 'rollup-plugin-serve';

const SERVE = process.env.SERVE === 'true';

export default {
  input: 'src/plugin.js',
  // Builder.io gives every plugin the same shared copies of these modules.
  // They must stay external, or the plugin talks to a second, empty Builder.
  external: [
    'react',
    'react-dom',
    '@builder.io/react',
    '@builder.io/sdk',
    '@builder.io/app-context',
    '@material-ui/core',
    '@material-ui/icons',
    '@emotion/core',
    '@emotion/styled',
    'mobx',
    'mobx-react',
    'mobx-state-tree',
  ],
  output: [{ file: 'dist/plugin.system.js', format: 'system', sourcemap: true }],
  plugins: [
    nodeResolve(),
    ...(SERVE
      ? [
          serve({
            contentBase: 'dist',
            port: 1268,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Private-Network': 'true',
            },
          }),
        ]
      : []),
  ],
};
