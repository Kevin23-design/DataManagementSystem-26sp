# 问卷设计 Part-1

## 项目结构

```text
big_project_1/
├── README.md
├── docs/...
├── public/
│   ├── create.html
│   ├── dashboard.html
│   ├── fill.html
│   ├── index.html
│   ├── stats.html
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── auth.js
│       ├── create.js
│       ├── dashboard.js
│       ├── fill.js
│       └── stats.js
└── server/
	├── app.js
	├── package.json
	├── config/
	│   └── db.js
	├── middleware/
	│   └── auth.js
	├── models/
	│   ├── Question.js
	│   ├── Response.js
	│   ├── Survey.js
	│   └── User.js
	├── routes/
	│   ├── auth.js
	│   ├── fill.js
	│   ├── questions.js
	│   ├── stats.js
	│   └── surveys.js
	├── tests/
	│   └── survey-system.e2e.test.js
	└── utils/
		├── jumpLogic.js
		└── validation.js
```

## 目录说明

- `public/`：前端静态页面与样式、脚本文件。
- `server/`：后端服务代码（Express + MongoDB），包含路由、模型、中间件与工具函数。
- `docs/`：测试与说明文档。
