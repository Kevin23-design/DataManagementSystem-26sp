require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');

const authRoutes = require('./routes/auth');
const surveyRoutes = require('./routes/surveys');
const questionRoutes = require('./routes/questions');
const fillRoutes = require('./routes/fill');
const statsRoutes = require('./routes/stats');

const app = express();

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// 路由
app.use('/api/auth', authRoutes);
app.use('/api/surveys', surveyRoutes);
app.use('/api', questionRoutes);
app.use('/api/survey', fillRoutes);
app.use('/api/surveys', statsRoutes);

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('全局错误:', err.stack || err);
  res.status(err.status || 500).json({ error: err.message || '服务器内部错误' });
});

// 前端路由 fallback
app.get('{*path}', (req, res) => {
  // API 路由 404
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: '接口不存在' });
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// 启动
const PORT = process.env.PORT || 3000;

const startServer = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
  });
};

// 如果直接运行则启动服务器，否则导出 app 供测试使用
if (require.main === module) {
  startServer();
}

module.exports = app;
