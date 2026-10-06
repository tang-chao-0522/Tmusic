const path = require('path')

module.exports = {
  projectName: 'TMusic Aurora',
  date: '2026-10-06',
  designWidth: 750,
  deviceRatio: { 750: 1 },
  sourceRoot: 'src',
  outputRoot: 'dist',
  framework: 'react',
  compiler: { type: 'webpack5', prebundle: { enable: false } },
  plugins: [],
  alias: { '@': path.resolve(__dirname, '..', 'src') },
  defineConstants: {
    __API_URL__: JSON.stringify(process.env.TARO_APP_API_URL || 'http://127.0.0.1:4100/api/v1'),
  },
  mini: { postcss: { autoprefixer: { enable: true }, pxtransform: { enable: true, config: {} } } },
}
