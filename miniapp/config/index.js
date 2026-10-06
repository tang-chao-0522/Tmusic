const path = require('path')

module.exports = {
  projectName: 'TMusic Aurora',
  date: '2026-10-06',
  designWidth: 750,
  deviceRatio: { 750: 1 },
  sourceRoot: 'src',
  outputRoot: 'dist',
  framework: 'react',
  compiler: 'webpack5',
  plugins: [],
  alias: { '@': path.resolve(__dirname, '..', 'src') },
  defineConstants: {
    __API_URL__: JSON.stringify(process.env.TARO_APP_API_URL || 'https://example.com/api/v1'),
  },
  mini: { postcss: { autoprefixer: { enable: true }, pxtransform: { enable: true, config: {} } } },
}
