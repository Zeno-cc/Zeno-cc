# 个人主页视觉与动画维护

## 展示层级

顶部保留静态中文横幅，只让下一行中文打字动效变化；代表作品保持可点击的真实文字；中部的立体贡献草坪作为主要数据视觉；详细统计折叠；页尾用琥珀色贡献小蛇收尾。不再堆叠奖杯、访问计数和重复统计卡片。

深色：深蓝底色、青绿贡献、琥珀强调。浅色：近白底色、深青绿文字和贡献、棕金强调。三类图片均提供深色、浅色，以及对应静态版本。README 用 picture 的媒体条件选择静态/动态与深浅主题。

## 数据和资源

- 来源为 GitHub 公开可见资料和贡献日历，不读取私有仓库内容、不申请个人访问令牌。若账号自行公开了匿名私有贡献数量，日历可能包含这些已经公开的计数；不会披露项目名称或代码。
- 3D 草坪使用 `yoshi389111/github-profile-3d-contrib` v0.9.2，贡献柱采用一次性生长动画，而不是循环彩虹闪烁；雷达标签通过 l10n 中文化。
- 小蛇使用 `Platane/snk` v3.5.0 的 svg-only action，统一青绿格子与琥珀色蛇身。
- 打字动效由 `DenverCoder1/readme-typing-svg` 公共服务生成后缓存到本仓库。访问主页不需要实时请求该第三方服务。服务暂不可用时保留上一份有效图片。
- 代码与配置在 main；生成图片在 profile-assets。新流程不往 main 每天追加图片提交，也不会与原数据面板争抢同一分支。

## 更新和故障

「更新个人主页动画」每天 UTC 00:43（北京时间 08:43）触发，也支持手动运行；调度可能因 GitHub 队列延迟。修改对应配置、脚本和工作流会触发一次生成。

生成任务只有 contents:read，发布任务才有 contents:write。两个第三方 Action 固定到对应版本的完整提交 SHA；不使用浮动 latest。

每个组件独立生成；同组件两种主题全部校验通过才替换。失败组件保留原图，其他成功组件继续刷新，最终任务明确报告失败而不是假装全部成功。所有组件失败则不发布。`profile-assets/update-status.json` 记录最近一次尝试的组件结果；失败组件的图仍可能是旧快照。

减少动态效果时，立体图移除 SMIL 动画并保留最终几何形状；小蛇停止 CSS 动画；打字图改为中文静态文字。README 不支持任意 JavaScript，这些动效只依赖 SVG。

## 验证

```bash
python -m unittest discover -s scripts -p 'test_profile_assets.py' -v
```

需要同时检查：Actions 成功、profile-assets 中三类图片各有四个变体、README 图片地址可用、深浅主题与减少动态效果分支正确。贡献图是活动记录，不等同于代码质量、工时或商业价值。

## 上游

- https://github.com/Platane/snk
- https://github.com/yoshi389111/github-profile-3d-contrib
- https://github.com/DenverCoder1/readme-typing-svg
