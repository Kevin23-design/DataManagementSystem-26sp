# 基于 MongoDB 的问卷系统 — 实现计划

基于课程大作业要求，开发一个简化版在线问卷系统。系统需使用 MongoDB 存储所有数据，支持用户注册登录、问卷 CRUD、三种题型（单选/多选/填空）、跳转逻辑、填写校验、统计分析。

> [!IMPORTANT]
> 评分权重：MongoDB 设计 35 + 后端逻辑 25 + 测试 10 + 文档 15 + AI 使用说明 15。
> 第二阶段会有需求变更，设计需有扩展性，**不可推倒重做**。

---

## 技术选型

| 层 | 选择 | 理由 |
|---|---|---|
| 后端 | **Node.js + Express** | 与 MongoDB 天然配合 (JSON ↔ BSON)，生态丰富 |
| 数据库 | **MongoDB + Mongoose** | 课程指定；Mongoose 提供 schema 校验和中间件 |
| 认证 | **JWT** | 无状态，简单够用 |
| 前端 | **Vanilla HTML/CSS/JS** | 课程不要求复杂前端，够用即可 |
| 测试 | **Jest + Supertest** | 自动化 API 测试 |

---

## MongoDB 数据库设计

### 集合（Collections）

#### 1. `users`
```json
{
  "_id": ObjectId,
  "username": String,       // unique index
  "password": String,       // bcrypt hash
  "createdAt": Date
}
```

#### 2. `surveys`
```json
{
  "_id": ObjectId,
  "creatorId": ObjectId,    // ref → users
  "title": String,
  "description": String,
  "allowAnonymous": Boolean,
  "status": String,         // "draft" | "published" | "closed"
  "deadline": Date | null,
  "shareCode": String,      // unique, 用于生成 /survey/:shareCode
  "createdAt": Date,
  "updatedAt": Date
}
```

#### 3. `questions`
```json
{
  "_id": ObjectId,
  "surveyId": ObjectId,     // ref → surveys, indexed
  "order": Number,          // 题目顺序
  "type": String,           // "single_choice" | "multiple_choice" | "text_input" | "number_input"
  "title": String,
  "required": Boolean,
  "options": [String],      // 选择题的选项
  "validation": {
    // 多选
    "minSelect": Number,
    "maxSelect": Number,
    "exactSelect": Number,
    // 文本
    "minLength": Number,
    "maxLength": Number,
    // 数字
    "min": Number,
    "max": Number,
    "integerOnly": Boolean
  },
  "jumpRules": [
    {
      "condition": {
        "type": String,     // "equals" | "contains" | "gt" | "lt" | "gte" | "lte"
        "value": Mixed      // 选项值 / 数字
      },
      "targetQuestionOrder": Number  // 跳转到哪题
    }
  ]
}
```

> [!NOTE]
> 题目单独成为集合（而非嵌入 survey 文档），原因：
> 1. 单个问卷可能有大量题目，嵌入会导致文档膨胀
> 2. 独立集合方便后续按题目查询统计
> 3. 跳转逻辑引用题目 order，独立存储更灵活
> 4. 第二阶段需求变更时更容易增删字段

#### 4. `responses`
```json
{
  "_id": ObjectId,
  "surveyId": ObjectId,    // ref → surveys, indexed
  "respondentId": ObjectId | null, // null = 匿名
  "answers": [
    {
      "questionId": ObjectId,
      "questionOrder": Number,
      "value": Mixed        // String | Number | [String]
    }
  ],
  "submittedAt": Date
}
```

### 索引策略
- `users.username`: unique
- `surveys.creatorId`: 查询用户的问卷列表
- `surveys.shareCode`: unique, 访问问卷链接
- `questions.surveyId` + `questions.order`: 复合索引
- `responses.surveyId`: 统计查询

### 为什么选 MongoDB？
1. 问卷结构灵活，不同题型有不同的 validation schema，文档模型天然适合
2. jumpRules 是嵌套结构，关系数据库需要额外的关联表
3. answers 中的 value 类型不固定（字符串/数组/数字），MongoDB 的弱类型更自然
4. 问卷系统读多写少，MongoDB 的查询性能优秀

---

## 后端 API 设计

### 用户模块
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/register` | 注册 |
| POST | `/api/auth/login` | 登录，返回 JWT |

### 问卷管理（需认证）
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/surveys` | 创建问卷 |
| GET | `/api/surveys` | 获取我的问卷列表 |
| GET | `/api/surveys/:id` | 获取问卷详情 |
| PUT | `/api/surveys/:id` | 更新问卷基本信息 |
| PUT | `/api/surveys/:id/publish` | 发布问卷 |
| PUT | `/api/surveys/:id/close` | 关闭问卷 |
| DELETE | `/api/surveys/:id` | 删除问卷 |

### 题目管理（需认证）
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/surveys/:id/questions` | 添加题目 |
| GET | `/api/surveys/:id/questions` | 获取问卷的所有题目 |
| PUT | `/api/questions/:id` | 更新题目 |
| DELETE | `/api/questions/:id` | 删除题目 |

### 问卷填写
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/survey/:shareCode` | 通过分享链接获取问卷 + 题目 |
| POST | `/api/survey/:shareCode/submit` | 提交问卷回答 |

### 统计（需认证，仅创建者可访问）
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/surveys/:id/stats` | 获取整卷统计 |
| GET | `/api/surveys/:id/stats/:questionId` | 获取单题统计 |

---

## 项目结构

```
big_project_1/
├── server/
│   ├── package.json
│   ├── app.js                  # Express 入口
│   ├── config/
│   │   └── db.js               # MongoDB 连接
│   ├── models/
│   │   ├── User.js
│   │   ├── Survey.js
│   │   ├── Question.js
│   │   └── Response.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── surveys.js
│   │   ├── questions.js
│   │   ├── fill.js             # 填写问卷
│   │   └── stats.js
│   ├── middleware/
│   │   └── auth.js             # JWT 中间件
│   ├── utils/
│   │   ├── validation.js       # 题目校验逻辑
│   │   └── jumpLogic.js        # 跳转逻辑引擎
│   └── tests/
│       ├── auth.test.js
│       ├── survey.test.js
│       ├── question.test.js
│       ├── fill.test.js
│       ├── jumpLogic.test.js
│       └── stats.test.js
├── public/                     # 前端静态文件
│   ├── index.html              # 首页（登录/注册）
│   ├── dashboard.html          # 问卷管理
│   ├── create.html             # 创建/编辑问卷
│   ├── fill.html               # 填写问卷
│   ├── stats.html              # 统计结果
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── auth.js
│       ├── dashboard.js
│       ├── create.js
│       ├── fill.js
│       └── stats.js
└── 数据管理系统大作业一要求.md
```

---

## 关键逻辑说明

### 跳转逻辑引擎
- 填写问卷时，前端按 `order` 顺序展示题目
- 每答完一题，检查该题的 `jumpRules`
- 按规则顺序匹配，第一个匹配的规则生效
- 无匹配规则则顺序进入下一题
- 支持单选（equals）、多选（contains）、数字比较（gt/lt/gte/lte）

### 填写校验
- 必答题检查
- 多选题 min/max/exact 数量检查
- 文本填空 min/maxLength 检查
- 数字填空 min/max 范围 + integerOnly 检查
- 后端提交时二次校验（不信任前端）

### 统计聚合
- 使用 MongoDB aggregation pipeline
- 单选/多选：`$unwind` + `$group` 按选项计数
- 数字填空：`$avg` 聚合
- 文本填空：直接返回所有回答列表

---

## 实现顺序

1. **项目初始化**：npm init, 安装依赖, 配置 MongoDB 连接
2. **Models 层**：定义 Mongoose schemas
3. **用户模块**：注册/登录 + JWT
4. **问卷 CRUD**
5. **题目 CRUD + 校验规则**
6. **跳转逻辑**
7. **问卷填写 + 校验**
8. **统计聚合**
9. **前端页面**
10. **测试用例**
11. **文档**

---

## Verification Plan

### Automated Tests (Jest + Supertest)
```bash
cd f:\code\DataManagementSystem\big_project_1\server
npm test
```

测试覆盖：
- `auth.test.js`：注册、登录、重复用户名、密码错误
- `survey.test.js`：创建/更新/删除/发布/关闭问卷、权限检查
- `question.test.js`：添加/更新/删除题目、各种校验规则
- `fill.test.js`：提交回答、校验失败场景、匿名填写
- `jumpLogic.test.js`：各种跳转条件匹配
- `stats.test.js`：单选/多选计数、数字平均值、文本列表

### Manual Verification
1. 启动服务器 `npm start`，打开浏览器访问前端页面
2. 注册用户 → 登录 → 创建问卷 → 添加各类型题目 → 设置跳转规则 → 发布
3. 用另一个账号通过链接填写问卷，验证跳转和校验
4. 查看统计结果是否正确

> [!TIP]
> 建议你确认一下以上技术选型和数据库设计是否符合你的期望，因为第二阶段不能推倒重做。
