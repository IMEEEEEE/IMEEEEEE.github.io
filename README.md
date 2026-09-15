# Yi Liu — Personal Portfolio

当前为本地设计阶段的个人主页样稿。

## 文件

- `index.html`：页面内容与结构
- `index.css`：视觉样式、响应式布局和深浅色适配

页面无构建依赖，可直接通过本地静态服务器预览。暂未发布。

## Photography 图片

- Lens 使用的 2K 照片按年份保存在 `assets/Photography/2k/YYYY/`。
- 所有照片保持原始比例，长边最大为 2560px；缩略图和点击大图共用同一文件。
- 如需从新原图生成照片，在 PowerShell 中运行 `./tools/generate-photography-2k.ps1`。
- 当前年份画廊的图片、日期与地点仍在 `index.html` 中维护。

## 颜色系统

### 核心规则

- 每个 section 在浅色和深色模式下各只有一个基础主题色：`--accent`。
- 强调、填充、边框、连线、小球和进度状态不得创建新的主题色，只能使用当前 section 的 `--accent` 与统一透明度档位。
- `--accent-strong`、`--accent-soft` 和 `--accent-ink` 已停用，不得重新引入。
- Research 的温度可视化是唯一允许改变 RGB 的状态：低温使用 `--accent`，中温使用 `--thermal-warm`，高温使用 `--thermal-hot`。
- 温度插值只改变 RGB，不改变组件当前所属的透明度档位。
- 动画过程可以在两个状态端点之间连续插值；设计规范只统计端点，不新增固定档位。

### Section 主题色

| Section | 浅色模式 | 深色模式 |
| --- | --- | --- |
| Profile | `#DA7C4E` / `rgb(218, 124, 78)` | `#8E5133` / `rgb(142, 81, 51)` |
| Research | `#4EDA7A` / `rgb(78, 218, 122)` | `#338E4F` / `rgb(51, 142, 79)` |
| Lab | `#4EAEDA` / `rgb(78, 174, 218)` | `#33718E` / `rgb(51, 113, 142)` |
| Music | `#DA4E94` / `rgb(218, 78, 148)` | `#8E3360` / `rgb(142, 51, 96)` |
| Photography | `#8C6ADA` / `rgb(140, 106, 218)` | `#5B458E` / `rgb(91, 69, 142)` |

深色模式主题色由对应浅色 RGB 各通道乘以 `0.65` 后四舍五入得到。

### 月份基础色

月份基础色沿用 Calendar 项目 `script.js` 中 `colors` 数组的顺序。下表的深色模式值遵循 MyPage 当前规则，由对应浅色 RGB 各通道乘以 `0.65` 后四舍五入得到；不直接使用 Calendar 的 `darkColors`、`darkColors2` 或 `darkColors3` 数组。

| 月份 | 浅色模式 | 深色模式（RGB × 0.65） |
| --- | --- | --- |
| 1月 / Jan | `#DA4E4E` / `rgb(218, 78, 78)` | `#8E3333` / `rgb(142, 51, 51)` |
| 2月 / Feb | `#DA7C4E` / `rgb(218, 124, 78)` | `#8E5133` / `rgb(142, 81, 51)` |
| 3月 / Mar | `#DAA04E` / `rgb(218, 160, 78)` | `#8E6833` / `rgb(142, 104, 51)` |
| 4月 / Apr | `#DACB4E` / `rgb(218, 203, 78)` | `#8E8433` / `rgb(142, 132, 51)` |
| 5月 / May | `#B7DA4E` / `rgb(183, 218, 78)` | `#778E33` / `rgb(119, 142, 51)` |
| 6月 / Jun | `#4EDA7A` / `rgb(78, 218, 122)` | `#338E4F` / `rgb(51, 142, 79)` |
| 7月 / Jul | `#4EDA9D` / `rgb(78, 218, 157)` | `#338E66` / `rgb(51, 142, 102)` |
| 8月 / Aug | `#3EDAC8` / `rgb(62, 218, 200)` | `#288E82` / `rgb(40, 142, 130)` |
| 9月 / Sep | `#4EAEDA` / `rgb(78, 174, 218)` | `#33718E` / `rgb(51, 113, 142)` |
| 10月 / Oct | `#4E83DA` / `rgb(78, 131, 218)` | `#33558E` / `rgb(51, 85, 142)` |
| 11月 / Nov | `#4E62DA` / `rgb(78, 98, 218)` | `#33408E` / `rgb(51, 64, 142)` |
| 12月 / Dec | `#624EDA` / `rgb(98, 78, 218)` | `#40338E` / `rgb(64, 51, 142)` |

Calendar 在深色模式下仍保留以上月份 token；仅左侧大面积月份色块使用 Emphasis / 50% 与 `--calendar-surface` 混合，以降低亮度和饱和度。月份文字、Music 乐团与 WS2812 灯板继续使用月份 token 原色。

### Music 乐团色彩映射

乐团颜色按声部家族统一，不给单个乐器任意增加颜色。月份色必须引用全局 token，并随深浅主题切换；中性色同样不得写死。

| 声部家族 | Token | 月份 / 中性色 |
| --- | --- | --- |
| 弦乐 | `--month-feb` | 2月 / Feb |
| 木管 | `--month-sep` | 9月 / Sep |
| 铜管 | `--month-apr` | 4月 / Apr |
| 打击乐 | `--month-dec` | 12月 / Dec |
| 人声 | `--month-jun` | 6月 / Jun |
| 吉他类 | `--month-jan` | 1月 / Jan |
| 合成器 | `--month-nov` | 11月 / Nov |
| Piano | `--orchestra-neutral` | 浅色深灰 / 深色浅灰白 |

`--orchestra-neutral` 使用浅色模式 `#505653`、深色模式 `#C2C7C4`。

### Research 热力色卡

| 温度状态 | 浅色模式 | 深色模式 |
| --- | --- | --- |
| 低温 | `--accent`: `#4EDA7A` | `--accent`: `#338E4F` |
| 中温 | `--thermal-warm`: `#E69D56` | `--thermal-warm`: `#966638` |
| 高温 | `--thermal-hot`: `#DA4E4E` | `--thermal-hot`: `#8E3333` |

第二页温度映射端点：

- 50°C：低温主题色。
- 65°C：中温色。
- 85°C：高温色。
- 端点之间连续插值 RGB，透明度继承当前组件状态。

### 统一透明度档位

| 层级 | Token | 透明度 | 标准用途 |
| --- | --- | ---: | --- |
| Subtle | `--accent-subtle-strength` | 12% | 弱填充、次级轮廓 |
| Base | `--accent-base-strength` | 24% | 普通边框、普通曲线、未完成 Tile、3D 板面 |
| Emphasis | `--accent-emphasis-strength` | 50% | 中等强调、未选中副导航文字与序号 |
| Active | `--accent-active-strength` | 70% | 选中副导航序号、高亮填充或边框、完成 Tile、汇聚曲线、3D 主轮廓 |
| Solid | `--accent-solid-strength` | 100% | 小球、进度条、关键节点、最强轮廓 |

### 统一卡片状态标准

所有使用 section 主题色表达普通与高亮状态的交互卡片，统一使用以下端点：

| 卡片状态 | 边框 | 填充 |
| --- | --- | --- |
| 普通 | Base / 24% | Subtle / 12% |
| 悬停、选中或动画高亮 | Solid / 100% | Base / 24% |

- 普通边框必须使用 `rgb(from var(--accent) r g b / var(--accent-base-strength))`。
- 普通填充必须使用 `rgb(from var(--accent) r g b / var(--accent-subtle-strength))`。
- 高亮边框必须使用 `rgb(from var(--accent) r g b / var(--accent-solid-strength))`。
- 高亮填充必须使用 `rgb(from var(--accent) r g b / var(--accent-base-strength))`。
- 状态变化只允许改变边框与填充，不得通过缩放或位移改变卡片尺寸和位置。

### 统一卡片文字层级

Profile 01、02、03 以及后续同类信息卡片统一使用以下层级。卡片继承 bullet 的 Manrope 正文气质，但使用独立 Card tokens 控制信息密度，不直接继承 bullet 字号。

| 层级 | 使用场景 | 字体 | 字重 | Token | 标准档 | 紧凑档 | 颜色 | 行高 |
| --- | --- | --- | ---: | --- | ---: | ---: | --- | ---: |
| Card Title | 职位、学位、技能名称 | Manrope | 600 | `--card-title-size` | 15px / `.9375rem` | 14px / `.875rem` | `--heading` | 1.3 |
| Card Body | 机构、学校、说明正文 | Manrope | 400 | `--card-body-size` | 11px / `.6875rem` | 10px / `.625rem` | `--muted` | 1.55 |
| Card Meta | 日期、状态码、分类、技术标签、工具链 | IBM Plex Mono | 500 | `--card-meta-size` | 11px / `.6875rem` | 10px / `.625rem` | `--muted`、`--quiet` 或状态 `--accent` | 1.2–1.5 |

- Card Body 与 Card Meta 使用相同字号档位，但通过字体、行高和内容用途区分：Body 使用 Manrope / 1.55，Meta 使用 IBM Plex Mono / 1.2–1.5。
- Card Body 与 Card Meta 均不得低于紧凑档 10px。
- `--heading` 只用于 Card Title；需要持续阅读的 Card Body 不得使用 `--faint`。
- `--accent` 只用于状态码和小型功能标签，不用于 Card Title 或大段正文。
- 卡片文字不得设置整体 opacity；视觉弱化通过 `--muted` 与 `--quiet` 完成。
- 标准档用于宽度大于 1180px 且高度大于 760px 的桌面视口；其余桌面视口使用紧凑档；850px 以下恢复标准档。
- 高亮状态不得改变文字字号、字重、行高、尺寸或位置。

### Thermal intelligence 组件映射

| 页面 / 元素 | 普通状态 | 高亮或完成状态 |
| --- | --- | --- |
| 第二页 Device 填充 | Subtle / 12% | Base / 24% |
| 第二页 Device 边框 | Base / 24% | Active / 70% |
| 第二页 Tile | Base / 24% | Active / 70% |
| 第二页传输曲线 | Base / 24% | — |
| 第二页传输小球 | Solid / 100% | — |
| 第三页 Layer 填充 | Subtle / 12% | Base / 24% |
| 第三页 Layer 边框 | Base / 24% | Solid / 100% |
| 第三页普通曲线 | Base / 24% | — |
| 第三页汇聚共享曲线 | Active / 70% | — |
| 第三页传输小球 / 汇聚节点 | Solid / 100% | — |
| 3D Stack 板面 | Base / 24% | — |
| 3D Stack 次级轮廓 | Subtle / 12% | — |
| 3D Stack 主轮廓与 Tag 连线 | Active / 70% | — |
| 3D Stack SoC 填充 | Base / 24% | Active / 70% |
| 3D Stack SoC 轮廓 | Active / 70% | Solid / 100% |

第二页中 Device、温度条、降频文字、温度限制标记以及发往对应 Pi 的曲线和小球使用目标设备当前温度的 RGB；透明度严格使用上表对应档位。

第三页所有 Layer（包括 Expert Contributions Layer）的接收呼吸和发送高亮均使用填充 Base / 24% 与边框 Solid / 100%；静止状态统一使用填充 Subtle / 12% 与边框 Base / 24%。

### 中性界面色

中性色负责背景、文字和结构，不属于 section 主题色。

| Token | 浅色模式 | 深色模式 |
| --- | --- | --- |
| `--canvas` | `#C9C9C9` | `#141817` |
| `--paper` | `#FFFFFF` | `#FFFFFF`（当前继承值） |
| `--ink` | `#424743` | `#C0C7C4` |
| `--heading` | `#242624` | `#F1F5F3` |
| `--muted` | `#5E645F` | `#ABB3AF` |
| `--quiet` | `#686E69` | `#8E9893` |
| `--faint` | `#747A75` | `#727C77` |
| `--line` | `#D6D8D5` | `#39403D` |
| `--drag-hint` | `#626A65` | `#C1C9C5` |
| `--control-surface` | `#FFFFFF` | `#303533` |
| `--control-ink` | `#4E5450` | `#C7CDC9` |
| `--control-muted` | `#747A75` | `#9DA59F` |

修改配色时，仅编辑 `index.css` 顶部的浅色变量和 `@media (prefers-color-scheme: dark)` 中对应的深色变量；组件代码不得写入新的主题 RGB 或任意固定透明度。

## Thermal intelligence 排版规范

| 层级 | 使用场景 | 字体 | 字重 | Token | 标准档 | 紧凑档 | 颜色 |
| --- | --- | --- | ---: | --- | ---: | ---: | --- |
| Copy | 左侧 bullet、说明正文 | Manrope | 400 | `--thermal-copy-size` | 16px / 1rem | 14px / .875rem | `--muted` |
| UI | 设备名、温度、按钮名 | IBM Plex Mono | 500 | `--thermal-ui-size` | 13px / .8125rem | 12px / .75rem | `--muted` |
| Meta | 频率、Tile、RUN、温度上限 | IBM Plex Mono | 500 | `--thermal-meta-size` | 11px / .6875rem | 10px / .625rem | `--muted` |
| Label | 区域标题、数据分组标题 | IBM Plex Mono | 600 | `--thermal-ui-size` | 13px / .8125rem | 12px / .75rem | `--muted` |
| State | 当前运行、降频、告警 | 继承所在层级 | 继承 | 不新增字号 | — | — | 当前 section 主题色 |

### 响应规则

- 标准档用于宽度大于 1100px 且高度大于 760px 的桌面视口。
- 紧凑档用于 851–1100px 宽度，或桌面高度不超过 760px 的视口。
- 850px 以下回到标准字号并改为单栏，避免移动端文字过小。
- 代码中使用 `rem`，表中的整数 px 仅表示浏览器默认 16px 根字号下的换算结果。
- 不在具体组件上写任意字号；字体、字号和字重必须引用 `.thermal-demo` typography tokens。
- 标题可使用 `clamp()` 连续缩放；密集数据界面只使用上述离散档位，保证列对齐和可读性。
