# 前端组件说明

本文档说明博客前端主要组件的职责和维护注意事项。

## 全局布局

文件：

```text
src/layouts/BaseLayout.astro
```

职责：

- 全站 HTML 骨架。
- 顶部导航、搜索、主题切换。
- 全局 CSS 变量和浅色/深色主题。
- 文章页排版、代码块样式、表格样式。
- 页面访问统计和 Web Vitals 上报。
- Tab 圆盘导航、主题状态、搜索快捷键等全局脚本。

注意：

- 主题状态保存在浏览器本地，每个访客独立。
- 不要把后台管理权限逻辑放在前端，后台接口仍以 `ADMIN_TOKEN` 为准。
- 修改全局样式时要同时检查首页、文章页、后台和移动端。

## 主题背景

文件：

```text
src/components/AmbientFlow.astro
```

职责：

- 白天模式：Three.js / WebGL Shader 实现 Floating Lines 浅色流光背景。
- 夜间模式：OGL 实现 Galaxy 银色星光背景。
- 根据主题切换创建和销毁对应 WebGL 背景。
- 支持 `prefers-reduced-motion`，减少动态效果。

维护注意：

- 白天背景不要使用透明 WebGL canvas 叠加黑底，否则容易出现灰黑、脏暗问题。
- 夜间 Galaxy 保持银色星光，不要影响白天 Floating Lines。
- 背景组件固定在页面底层，必须 `pointer-events: none`，避免遮挡页面交互。
- WebGL 参数调整后应在首页、文章页、关于页都测试。

## 音乐播放器

文件：

```text
src/components/FloatingMusicPlayer.astro
src/components/HomeMusicPlayer.astro
```

职责：

- `FloatingMusicPlayer`：真实 `<audio>` 播放器、悬浮面板、播放列表、歌词、音量、播放模式。
- `HomeMusicPlayer`：首页卡片播放器，只做 UI 和控制入口，共用悬浮播放器状态。

状态：

- 播放状态保存在 `sessionStorage`。
- 保存键：`sinxy-music-playback`。
- 跨 Astro 路由切换时，悬浮播放器应持续存在并保持播放。

维护注意：

- 网易云 mp3 直链会过期，前端应优先使用 `/api/music` 最新返回的 `src`。
- `<audio>` 触发 `error` 时，应请求 `/api/music?refresh=1` 获取新直链。
- 不要把真实 mp3 内容代理到自己的服务器，当前设计只是返回第三方直链。
- 详细说明见 [music-system.md](music-system.md)。

## 首页时间组件

文件：

```text
src/components/HomeTimeWidget.astro
```

职责：

- 首页时间、日期和视觉时钟。
- 主题响应。
- 首屏视觉体验。

维护注意：

- 该组件曾经涉及较大的 Three.js 首屏脚本，后续要继续关注 bundle 大小。
- 移动端要检查高度、宽度和文字溢出。

## 首页欢迎动效

文件：

```text
src/components/HomeStoryCanvas.astro
```

职责：

- 首页欢迎区域的 Canvas 动效。
- 与个人资料、时间组件、音乐卡片共同组成首页首屏体验。

维护注意：

- 长文章页性能问题通常不应由首页 Canvas 影响。
- 修改时注意不要引入全站滚动卡顿。

## 桌宠

文件：

```text
src/components/CornerPet.astro
public/pet-clean/
```

职责：

- 左下角桌宠展示。
- 使用精灵图或静态资源切换状态。

维护注意：

- 资源路径必须在静态部署后可访问。
- preload 警告不一定是功能错误，但如果影响性能，可以重新评估是否需要预加载。
- 图片应尽量使用 WebP 并控制尺寸。

## 评论组件

文件：

```text
src/components/GiscusComments.astro
```

职责：

- 在文章页加载 Giscus 评论。
- 根据当前主题切换 Giscus 主题。

配置变量：

```text
PUBLIC_GISCUS_REPO
PUBLIC_GISCUS_REPO_ID
PUBLIC_GISCUS_CATEGORY
PUBLIC_GISCUS_CATEGORY_ID
```

维护注意：

- Giscus 配置是公开配置，不是密钥。
- 评论管理在 GitHub Discussions 中完成，不在本项目后台完成。

## Tab 圆盘导航

文件：

```text
src/components/RadialNav.astro
```

职责：

- 按住 Tab 呼出圆盘导航。
- 松开时跳转到首页、归档、标签、关于等路由。

维护注意：

- 必须阻止浏览器默认 Tab 焦点循环，否则长按 Tab 会框选页面元素。
- 与音乐播放器、表单控件、后台输入框共存时要重点测试键盘行为。
- 路由切换时不能破坏悬浮音乐播放器的持久播放。

## 后台页面

文件：

```text
src/pages/admin/index.astro
```

职责：

- Token 输入与后台访问。
- 文章编辑、预览、发布。
- 媒体上传和选择。
- 统计面板。

维护注意：

- 前端 Token 输入只是使用体验，不是安全边界。
- 后台 API 必须继续通过 `Authorization: Bearer <ADMIN_TOKEN>` 鉴权。
- Markdown 预览和服务端渲染要保持语法一致。
- 表格、公式、代码块工具栏变更后，应同时测试预览和文章页渲染。

## 组件修改后的测试建议

至少检查：

```bash
npx tsc --noEmit
npm run build
git diff --check
```

视觉或交互修改建议再检查：

- 首页。
- 文章详情页。
- 长文章滚动。
- 移动端文章目录。
- 后台编辑器。
- 白天/夜间主题切换。
- 路由切换时音乐是否持续播放。
