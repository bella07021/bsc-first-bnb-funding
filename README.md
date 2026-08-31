# 首笔原生 BNB 到账时间

公开网页：<https://bsc-first-bnb-funding.vercel.app>

批量查询 BSC 普通 EOA 地址历史上最早一笔成功、金额大于 0 的普通原生 BNB 入账，并显示：

- 北京时间（UTC+8）到账时间
- 精确 BNB 金额
- 来源 CEX 地址标签（精确地址匹配）
- 交易哈希及 BscScan 链接

前端单次最多接收 300 个地址，按每批 20 个依次查询，并实时显示批次、完成数量和百分比，最后统一汇总结果。

不包含 Internal Transaction。查询失败或数据覆盖不完整时会显示失败，不会误报为“无普通入账”。

## 本地运行

```bash
npm install
npm run dev
```

## 部署

`main` 分支已连接 Vercel，推送后自动构建部署。
