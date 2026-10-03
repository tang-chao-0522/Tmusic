# 前端组件约定

- `ui/`：shadcn/ui 风格的可复制基础组件。主题变量在 `src/styles/tailwind.css`，新组件可用 `npx shadcn@latest add <name> -c frontend` 添加，并检查生成后的主题和依赖差异。
- `shared/`：跨页面或页面区块的视觉/布局组件，例如 `GlassPanel`、`SectionHeading`。
- `music/`：歌曲领域组件，例如 `TrackListItem`，供首页和搜索结果复用。
- `player/`、`layout/`、`social/`：原有的播放器、布局和互动组件，逐步迁移，不一次性重写。

基础组件通过 `className` 扩展 Tailwind 类；页面已有的 CSS 类名仍保留，用于兼容樱花毛玻璃视觉。不要在 `ui/` 中加入 API 请求或播放器状态。歌曲列表使用 `TrackListItem` 时，把播放行为以 `onPlay` 传入；搜索页的绝对定位由虚拟列表通过 `style` 传入。
