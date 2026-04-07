const express = require('express');
const QuestionBank = require('../models/QuestionBank');
const Question = require('../models/Question');
const { auth } = require('../middleware/auth');

const router = express.Router();

// POST /api/question-banks - 创建题库
router.post('/', auth, async (req, res) => {
  try {
    const { name, description } = req.body;
    const bank = new QuestionBank({
      name,
      description,
      creatorId: req.userId,
    });
    await bank.save();
    res.status(201).json(bank);
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ error: messages.join('; ') });
    }
    res.status(500).json({ error: '服务器错误' });
  }
});

// GET /api/question-banks - 获取我的题库列表
router.get('/', auth, async (req, res) => {
  try {
    const banks = await QuestionBank.find({ creatorId: req.userId }).sort({ createdAt: -1 });
    res.json(banks);
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// GET /api/question-banks/:id - 获取题库详情（含题目列表）
router.get('/:id', auth, async (req, res) => {
  try {
    const bank = await QuestionBank.findById(req.params.id);
    if (!bank) {
      return res.status(404).json({ error: '题库不存在' });
    }
    if (bank.creatorId.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: '无权限访问' });
    }

    // 获取题目详情（最新版本）
    const questions = await Question.find({
      _id: { $in: bank.questionIds },
      isLatest: true,
    });

    res.json({ bank, questions });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// PUT /api/question-banks/:id - 更新题库信息
router.put('/:id', auth, async (req, res) => {
  try {
    const bank = await QuestionBank.findById(req.params.id);
    if (!bank) {
      return res.status(404).json({ error: '题库不存在' });
    }
    if (bank.creatorId.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: '无权限操作' });
    }

    const { name, description } = req.body;
    if (name !== undefined) bank.name = name;
    if (description !== undefined) bank.description = description;

    await bank.save();
    res.json(bank);
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// DELETE /api/question-banks/:id - 删除题库
router.delete('/:id', auth, async (req, res) => {
  try {
    const bank = await QuestionBank.findById(req.params.id);
    if (!bank) {
      return res.status(404).json({ error: '题库不存在' });
    }
    if (bank.creatorId.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: '无权限操作' });
    }

    await QuestionBank.findByIdAndDelete(bank._id);
    res.json({ message: '题库已删除' });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// POST /api/question-banks/:id/questions - 向题库添加题目
router.post('/:id/questions', auth, async (req, res) => {
  try {
    const bank = await QuestionBank.findById(req.params.id);
    if (!bank) {
      return res.status(404).json({ error: '题库不存在' });
    }
    if (bank.creatorId.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: '无权限操作' });
    }

    const { questionId } = req.body;
    if (!questionId) {
      return res.status(400).json({ error: '请提供题目ID' });
    }

    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({ error: '题目不存在' });
    }

    // 存 rootQuestionId，这样题目更新版本时题库自动跟踪
    const rootId = question.rootQuestionId || question._id;
    if (bank.questionIds.some(id => id.toString() === rootId.toString())) {
      return res.status(400).json({ error: '该题目已在题库中' });
    }

    bank.questionIds.push(rootId);
    await bank.save();
    res.json(bank);
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// DELETE /api/question-banks/:id/questions/:questionId - 从题库移除题目
router.delete('/:id/questions/:questionId', auth, async (req, res) => {
  try {
    const bank = await QuestionBank.findById(req.params.id);
    if (!bank) {
      return res.status(404).json({ error: '题库不存在' });
    }
    if (bank.creatorId.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: '无权限操作' });
    }

    bank.questionIds = bank.questionIds.filter(
      id => id.toString() !== req.params.questionId,
    );
    await bank.save();
    res.json(bank);
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
