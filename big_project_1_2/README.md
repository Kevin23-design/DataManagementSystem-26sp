# 问卷设计 Part-2（需求变更版）

## 项目结构

```text
big_project_1_2/
├── README.md
├── docs/...
├── public/
│   ├── create.html
│   ├── dashboard.html
│   ├── fill.html
│   ├── index.html
│   ├── question-bank.html    ← 新增：题库管理页
│   ├── question-lib.html     ← 新增：题目库页
│   ├── stats.html
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── auth.js
│       ├── create.js          （改造：支持从题目库选题）
│       ├── dashboard.js
│       ├── fill.js
│       ├── question-bank.js   ← 新增
│       ├── question-lib.js    ← 新增
│       └── stats.js
└── server/
	├── app.js                 （修改：注册新路由）
	├── package.json
	├── config/
	│   └── db.js
	├── middleware/
	│   └── auth.js
	├── models/
	│   ├── Question.js        （重构：独立实体 + 版本链）
	│   ├── QuestionBank.js    ← 新增：题库模型
	│   ├── Response.js
	│   ├── Survey.js          （扩展：新增 questionRefs）
	│   └── User.js
	├── routes/
	│   ├── auth.js
	│   ├── fill.js            （修改：适配 questionRefs）
	│   ├── questionBank.js    ← 新增：题库 CRUD
	│   ├── questionLib.js     ← 新增：独立题目管理 + 版本 + 共享 + 跨问卷统计
	│   ├── questions.js       （重写：改为引用管理）
	│   ├── stats.js           （修改：适配 questionRefs）
	│   └── surveys.js         （修改：删除不级联删题）
	├── tests/
	│   └── survey-system.e2e.test.js  （重写：23 个测试用例）
	└── utils/
		├── jumpLogic.js       （不变）
		└── validation.js      （不变）
```

## 目录说明

- `public/`：前端静态页面与样式、脚本文件。
- `server/`：后端服务代码（Express + MongoDB），包含路由、模型、中间件与工具函数。
- `docs/`：核心文档、测试样例说明、项目启动说明、需求变更文档等。

## 相对第一阶段的主要变更

1. **题目独立化**：Question 从问卷附属改为独立实体，支持多问卷复用。
2. **COW 版本管理**：修改已发布引用的题目时自动创建新版本，旧问卷不受影响。
3. **题目共享**：支持将题目共享给其他用户使用。
4. **题库管理**：新增 QuestionBank 模型，可按分组管理常用题目。
5. **跨问卷统计**：支持查看同一题在所有问卷中的回答汇总及按问卷分组明细。
