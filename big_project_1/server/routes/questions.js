const express = require('express');
const Question = require('../models/Question');
const Survey = require('../models/Survey');
const { auth } = require('../middleware/auth');

const router = express.Router();

// POST /api/surveys/:surveyId/questions - 添加题目
router.post('/surveys/:surveyId/questions', auth, async (req, res) => {
  try {
    const survey = await Survey.findById(req.params.surveyId);
    if (!survey) {
      return res.status(404).json({ error: '问卷不存在' });
    }
    if (survey.creatorId.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: '无权限操作' });
    }
    if (survey.status !== 'draft') {
      return res.status(400).json({ error: '只能在草稿状态添加题目' });
    }

    const { type, title, required, options, validation, jumpRules, order } = req.body;

    // 自动计算 order
    let finalOrder = order;
    if (finalOrder === undefined) {
      const maxOrderDoc = await Question.findOne({ surveyId: survey._id })
        .sort({ order: -1 })
        .select('order');
      finalOrder = maxOrderDoc ? maxOrderDoc.order + 1 : 1;
    }

    const question = new Question({
      surveyId: survey._id,
      order: finalOrder,
      type,
      title,
      required: required || false,
      options: options || [],
      validation: validation || {},
      jumpRules: jumpRules || [],
    });

    await question.save();
    res.status(201).json(question);
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ error: messages.join('; ') });
    }
    res.status(500).json({ error: '服务器错误' });
  }
});

// GET /api/surveys/:surveyId/questions - 获取问卷所有题目
router.get('/surveys/:surveyId/questions', auth, async (req, res) => {
  try {
    const survey = await Survey.findById(req.params.surveyId);
    if (!survey) {
      return res.status(404).json({ error: '问卷不存在' });
    }
    if (survey.creatorId.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: '无权限访问' });
    }

    const questions = await Question.find({ surveyId: survey._id }).sort({ order: 1 });
    res.json(questions);
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// PUT /api/questions/:id - 更新题目
router.put('/questions/:id', auth, async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) {
      return res.status(404).json({ error: '题目不存在' });
    }

    const survey = await Survey.findById(question.surveyId);
    if (!survey || survey.creatorId.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: '无权限操作' });
    }
    if (survey.status !== 'draft') {
      return res.status(400).json({ error: '只能在草稿状态修改题目' });
    }

    const { type, title, required, options, validation, jumpRules, order } = req.body;
    if (type !== undefined) question.type = type;
    if (title !== undefined) question.title = title;
    if (required !== undefined) question.required = required;
    if (options !== undefined) question.options = options;
    if (validation !== undefined) question.validation = validation;
    if (jumpRules !== undefined) question.jumpRules = jumpRules;
    if (order !== undefined) question.order = order;

    await question.save();
    res.json(question);
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// DELETE /api/questions/:id - 删除题目
router.delete('/questions/:id', auth, async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) {
      return res.status(404).json({ error: '题目不存在' });
    }

    const survey = await Survey.findById(question.surveyId);
    if (!survey || survey.creatorId.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: '无权限操作' });
    }
    if (survey.status !== 'draft') {
      return res.status(400).json({ error: '只能在草稿状态删除题目' });
    }

    await Question.findByIdAndDelete(question._id);
    res.json({ message: '题目已删除' });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
