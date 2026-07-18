# 音乐系统

本文档说明博客音乐播放器的配置、后端接口、前端状态恢复和常见问题。

## 功能概览

音乐系统由两部分组成：

- 后端：`GET /api/music`，通过 `@meting/core` 获取网易云音乐数据。
- 前端：悬浮播放器和首页卡片播放器，共用同一个 `<audio>` 实例和播放状态。

相关文件：

| 文件 | 说明 |
| --- | --- |
| [../server/index.ts](../server/index.ts) | `/api/music` 后端接口 |
| [../src/components/FloatingMusicPlayer.astro](../src/components/FloatingMusicPlayer.astro) | 悬浮播放器、状态同步和跨路由播放 |
| [../src/components/HomeMusicPlayer.astro](../src/components/HomeMusicPlayer.astro) | 首页卡片播放器 UI |

## 环境变量

在 VPS 的 `~/.sinxy-blog.env` 中配置：

```bash
MUSIC_PLAYLIST_ID='2171870436'
MUSIC_IDS=''
```

优先级：

1. 如果 `MUSIC_PLAYLIST_ID` 不为空，使用整个歌单。
2. 如果 `MUSIC_PLAYLIST_ID` 为空，使用 `MUSIC_IDS`。

`MUSIC_IDS` 示例：

```bash
MUSIC_IDS='1901371647,1824045033'
```

修改后重启后端：

```bash
sudo systemctl restart sinxy-blog
curl http://127.0.0.1:8787/api/music
```

## 后端数据流程

```text
/api/music
  |
  v
读取 MUSIC_PLAYLIST_ID / MUSIC_IDS
  |
  v
@meting/core 获取网易云歌曲元数据
  |
  v
逐首获取音频 src、封面 cover、歌词 lrcUrl
  |
  v
返回给前端播放器
```

返回结构：

```ts
type MusicSong = {
  id: string;
  title: string;
  artist: string;
  cover: string;
  src: string;
  lrcUrl: string;
};
```

## 缓存策略

网易云返回的 `src` 是临时播放直链，可能过期或被 403 拒绝。

当前后端缓存策略：

- 内存缓存：10 分钟。
- 本地兜底缓存：最多 30 分钟。
- 持久缓存文件：`.data/music-cache.json`。
- 强制刷新：`GET /api/music?refresh=1`。

普通请求：

```bash
curl http://127.0.0.1:8787/api/music
```

强制刷新：

```bash
curl "http://127.0.0.1:8787/api/music?refresh=1"
```

强制刷新会尽量绕过本地旧缓存，重新请求网易云直链。

## 前端播放器状态

悬浮播放器负责真实播放。首页卡片播放器只是同一播放状态的另一个控制面板。

前端会在 `sessionStorage` 保存：

- 当前歌曲 ID。
- 播放进度。
- 音量。
- 静音状态。
- 播放模式。
- 是否正在播放。
- 歌曲列表快照。

保存键：

```text
sinxy-music-playback
```

页面刷新或跨路由切换后，播放器会尝试恢复歌曲、进度和播放状态。

## 为什么会出现 403

网易云音乐直链不是长期稳定资源，常见失败原因：

- 临时 URL 过期。
- 当前 IP、地区或版权策略不允许播放。
- CDN 节点拒绝请求。
- 浏览器还在使用前端保存的旧直链。

控制台示例：

```text
Failed to load resource: the server responded with a status of 403
```

如果失败 URL 中带有旧时间戳，而 `/api/music` 已经返回新时间戳，通常说明前端恢复了旧 `src`。

## 当前恢复策略

前端初始化时：

1. 请求 `/api/music` 获取最新歌曲列表。
2. 优先使用接口返回的最新 `src`。
3. 只从 `sessionStorage` 恢复当前歌曲 ID、进度、音量和播放模式。
4. 不让旧 `sessionStorage` 歌单覆盖接口的新直链。

音频加载失败时：

1. 触发 `<audio>` 的 `error` 事件。
2. 请求 `/api/music?refresh=1`。
3. 保留当前歌曲 ID 和播放进度。
4. 用新直链重新设置歌曲。
5. 如果之前正在播放，则尝试继续播放。

## 排查步骤

### 1. 检查后端配置

```bash
curl http://127.0.0.1:8787/api/music
```

如果返回 `{"data":[]}`，检查：

- `MUSIC_PLAYLIST_ID` 是否正确。
- `MUSIC_IDS` 是否为空。
- `~/.sinxy-blog.env` 是否被 systemd 读取。
- 修改环境变量后是否重启 `sinxy-blog`。

### 2. 强制刷新音乐直链

```bash
curl "http://127.0.0.1:8787/api/music?refresh=1"
```

如果强制刷新后有新 `src`，说明后端可以正常获取网易云链接。

### 3. 清理浏览器播放状态

开发者工具 Console：

```js
sessionStorage.removeItem("sinxy-music-playback");
location.reload();
```

这会清理当前标签页保存的旧播放状态。

### 4. 查看 systemd 日志

```bash
journalctl -u sinxy-blog -n 100 --no-pager
```

如果 `@meting/core` 请求失败，后端会记录相关错误。

## 注意事项

- 本项目不代理 mp3 文件，只把网易云返回的 `src` 交给浏览器播放。
- 即使 API 正常返回，也不能保证所有歌曲都可播放。
- 版权受限歌曲可能无法播放。
- 部分歌曲链接会快速过期，因此不应长期缓存 `src`。
- `THREE.Clock` 的弃用警告与音乐播放无关。
- 桌宠图片 preload 警告也与音乐播放无关。
