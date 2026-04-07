const express = require('express');
const { nanoid } = require('nanoid');
const Survey = require('../models/Survey');
const Question = require('../models/Question');
const Response = require('../models/Response');
const { auth } = require('../middleware/auth');

const router = express.Router();

// POST /api/surveys - 创建问卷
router.post('/', auth, async (req, res) => {
  try {
    const { title, description, allowAnonymous, deadline } = req.body;
    const survey = new Survey({
      creatorId: req.userId,
      title,
      description,
      allowAnonymous,
      deadline: deadline || null,
      shareCode: nanoid(10),
    });
    await survey.save();
    res.status(201).json(survey);
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ error: messages.join('; ') });
    }
    res.status(500).json({ error: '服务器错误' });
  }
});

// GET /api/surveys - 获取我的问卷列表
router.get('/', auth, async (req, res) => {
  try {
    const surveys = await Survey.find({ creatorId: req.userId }).sort({ createdAt: -1 });
    res.json(surveys);
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// GET /api/surveys/:id - 获取问卷详情
router.get('/:id', auth, async (req, res) => {
  try {
    const survey = await Survey.findById(req.params.id);
    if (!survey) {
      return res.status(404).json({ error: '问卷不存在' });
    }
    if (survey.creatorId.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: '无权限访问' });
    }
    res.json(survey);
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// PUT /api/surveys/:id - 更新问卷基本信息
router.put('/:id', auth, async (req, res) => {
  try {
    const survey = await Survey.findById(req.params.id);
    if (!survey) {
      return res.status(404).json({ error: '问卷不存在' });
    }
    if (survey.creatorId.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: '无权限操作' });
    }
    if (survey.status !== 'draft') {
      return res.status(400).json({ error: '只能修改草稿状态的问卷' });
    }

    const { title, description, allowAnonymous, deadline } = req.body;
    if (title !== undefined) survey.title = title;
    if (description !== undefined) survey.description = description;
    if (allowAnonymous !== undefined) survey.allowAnonymous = allowAnonymous;
    if (deadline !== undefined) survey.deadline = deadline;

    await survey.save();
    res.json(survey);
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// PUT /api/surveys/:id/publish - 发布问卷
router.put('/:id/publish', auth, async (req, res) => {
  try {
    const survey = await Survey.findById(req.params.id);
    if (!survey) {
      return res.status(404).json({ error: '问卷不存在' });
    }
    if (survey.creatorId.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: '无权限操作' });
    }
    if (survey.status !== 'draft') {
      return res.status(400).json({ error: '只有草稿状态可以发布' });
    }

    // 检查是否至少有一道题
    const questionCount = await Question.countDocuments({ surveyId: survey._id });
    if (questionCount === 0) {
      return res.status(400).json({ error: '问卷至少需要一道题目才能发布' });
    }

    survey.status = 'published';
    await survey.save();
    res.json(survey);
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// PUT /api/surveys/:id/close - 关闭问卷
router.put('/:id/close', auth, async (req, res) => {
  try {
    const survey = await Survey.findById(req.params.id);
    if (!survey) {
      return res.status(404).json({ error: '问卷不存在' });
    }
    if (survey.creatorId.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: '无权限操作' });
    }
    if (survey.status !== 'published') {
      return res.status(400).json({ error: '只有已发布的问卷才能关闭' });
    }

    survey.status = 'closed';
    await survey.save();
    res.json(survey);
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// DELETE /api/surveys/:id - 删除问卷
router.delete('/:id', auth, async (req, res) => {
  try {
    const survey = await Survey.findById(req.params.id);
    if (!survey) {
      return res.status(404).json({ error: '问卷不存在' });
    }
    if (survey.creatorId.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: '无权限操作' });
    }

    // 级联删除题目和回答
    await Question.deleteMany({ surveyId: survey._id });
    await Response.deleteMany({ surveyId: survey._id });
    await Survey.findByIdAndDelete(survey._id);

    res.json({ message: '问卷已删除' });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
