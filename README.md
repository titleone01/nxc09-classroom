# 正泰 NXC-09 交流接触器三维教材

[在线教材](https://titleone01.github.io/nxc09-classroom/) · [教材嵌入示例](https://titleone01.github.io/nxc09-classroom/embed-example.html)

独立的中文静态教学网页。支持原厂模型的旋转、缩放、四个快捷视角、复位、六类端子标注，以及紧凑的机构爆炸图。沿壳体前后装配方向分层拉开，保持各层对齐；螺丝、接线件和铁芯叠片保留在所属组件内。全部 147 个原厂零件保留，可拖动拆开程度，单独观察线圈、静铁芯、衔铁与触头架、动触头、5 只触头压力弹簧和复位弹簧。四步原理导览将对应机构与吸合、触头切换、失电复位联系起来。

展开间距属于教学布局，不代表维修顺序或实际动作行程。本版不提供接线练习或实际通电仿真。常开 / 常闭的切换用文字讲解。

## 开发与运行

```powershell
npm ci
npm run build
```

构建同时生成 `calibration-data.js`、`model-data.js`、`explosion-data.js` 和带内容摘要的 `app-*.js`，并更新 HTML 引用。应一起提交源码与生成文件。

本项目根目录的 `启动接触器教材.cmd` 会构建当前代码并在系统分配的空闲端口启动，服务仅绑定 127.0.0.1。交付包内的启动入口可直接运行已构建版本。网页文件必须通过 HTTP 服务打开，不能仅双击 HTML。

`assets/calibration.json` 独立保存端子标注位置，单位为毫米；标注定位在端子接线口的表面，选中后高亮对应的一组接线口。`assets/explosion.json` 保存零件展开方向、内部部位分组与标注布局；`explosion.js` 根据原始位置计算平移，不改变几何或父子层级，合拢到 0% 时精确恢复。所有识别文字随所属外壳/端子盖移动。`lesson.js` 保存说明和官方出处。GLB 使用米，网页根节点统一缩放 1000。

运行时模型、Three.js 和 Meshopt 解码器全部本地提供，无外部 CDN 请求。下载进度按已知资源字节数显示，45 秒无数据时结束等待，自动重试一次，并提供手动重试。浏览器不支持 gzip 解压时加载兼容 GLB；缓存不可用时仍可正常下载。

## GitHub Pages

站点从公开仓库 main 分支根目录发布，保留 `.nojekyll`。提交、推送后检查 Pages 部署，并核对线上脚本和模型哈希。发布成功不能代替真实手机、国内运营商直连和实际教材平台的验证。

```html
<iframe src="https://titleone01.github.io/nxc09-classroom/"
  title="NXC-09 交流接触器三维互动教材"
  width="100%" height="1450" style="border:0"
  loading="lazy" allow="fullscreen"></iframe>
```

## 模型、参数与权利

- [正泰官方 NXC 产品与下载页](https://www.chintglobal.com/global/en/products/low-voltage/iec/industrial-control/nxc.html)
- [NXC-06～16 共用原厂 STEP](https://www.chintglobal.com/content/dam/chint/global/product-center/low-voltage/iec/industrial-control/ac-contactor/nxc/drawing/NXC-06-16-AC%20Contactor-Drawing.stp)
- [官方样本](https://www.chintglobal.com/content/dam/chint/global/product-center/low-voltage/iec/industrial-control/ac-contactor/nxc/catalog/NXC-AC-CONTACTOR-Catalog.pdf)：P-058 选型与线圈规格、P-069 接线图。
- [正泰 AC 接触器原理说明](https://www.chintglobal.com/mx/es/about-us/news-center/blog/a-comprehensive-guide-to-ac-contactors.html)：线圈、衔铁、触头和弹簧的基本作用。

采用三组主触头及 1NO+1NC 辅助触头的原厂共用装配。保留全部三角面，不重新制作外壳、端子或内部结构；只进行坐标整理、外观材质补充和精度受控压缩。原厂 STEP 没有颜色元数据，黑色外壳与蓝色操作部位的配色参照提供的照片作教学补充。CHINT、NXC-09 和端子识别文字为独立教学叠加层，不属于原厂 STEP 几何。

NXC-09 主回路 9 A 参数以官方样本的 AC-3、380 V / 400 V 工况表述。辅助触头的容量不同，不能套用 9 A；线圈额定电压无法从照片确认，不预设为 220 V。常开、常闭以线圈未得电、接触器正常释放时为基准。

CHINT、正泰商标及原厂素材的权利归其权利人，本网页并非正泰官方教材。原厂资源的权利不因公开仓库而改变，本仓库不授予额外的素材许可。Three.js、three-mesh-bvh、Meshoptimizer 的许可证分别保留在 `vendor/LICENSE`、`vendor/three-mesh-bvh.LICENSE` 和 `vendor/meshoptimizer.LICENSE`。

原始 STEP、Blender 工程、完整 GLB、制作脚本和实测记录另保存在本地项目交付目录；参考图片与 CAD 工程不随网页仓库发布。
## 工作动作和单文件离线版

工作动作页使用现有原厂详细机构，演示得电吸合、主触头 / NO 闭合、NC 断开及失电复位。外壳在动作页暂时隐藏，位移 2 mm 和弹簧压缩明确为教学设置。切换部位、拆解或复位恢复保存的原装配姿态。

`npm ci` 后运行 `npm run build`，同步构建在线页面与 `offline/NXC09_离线.html`。该 HTML 内嵌完整模型、脚本、解码器、样式和讲解，单独拷贝、改名、换位置后可在 Chrome / Edge 双击断网使用。
