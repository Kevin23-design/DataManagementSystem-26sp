const express = require('express');
const Question = require('../models/Question');
const Survey = require('../models/Survey');
const { auth } = require('../middleware/auth');

const router = express.Router();

// POST /api/surveys/:surveyId/questions - 从题目库选题添加到问卷
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

    const { questionId, order } = req.body;

    if (!questionId) {
      return res.status(400).json({ error: '请提供题目ID' });
    }

    // 验证题目存在且用户有权使用
    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({ error: '题目不存在' });
    }

    const isOwner = question.creatorId.toString() === req.userId.toString();
    const isShared = question.sharedWith.some(id => id.toString() === req.userId.toString());
    if (!isOwner && !isShared) {
      return res.status(403).json({ error: '无权限使用该题目' });
    }

    // 计算 order
    let finalOrder = order;
    if (finalOrder === undefined) {
      const maxRef = survey.questionRefs.reduce((max, ref) => Math.max(max, ref.order), 0);
      finalOrder = maxRef + 1;
    }

    // 检查是否已添加
    const alreadyAdded = survey.questionRefs.some(
      ref => ref.questionId.toString() === questionId.toString(),
    );
    if (alreadyAdded) {
      return res.status(400).json({ error: '该题目已在问卷中' });
    }

    survey.questionRefs.push({ questionId: question._id, order: finalOrder });
    survey.questionRefs.sort((a, b) => a.order - b.order);
    await survey.save();

    res.status(201).json({ survey, addedQuestion: question });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// POST /api/surveys/:surveyId/questions/new - 直接在问卷里创建新题并添加
router.post('/surveys/:surveyId/questions/new', auth, async (req, res) => {
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

    // 创建题目
    const question = new Question({
      creatorId: req.userId,
      type,
      title,
      required: required || false,
      options: options || [],
      validation: validation || {},
      jumpRules: jumpRules || [],
    });
    await question.save();

    // 计算 order
    let finalOrder = order;
    if (finalOrder === undefined) {
      const maxRef = survey.questionRefs.reduce((max, ref) => Math.max(max, ref.order), 0);
      finalOrder = maxRef + 1;
    }

    // 添加引用到问卷
    survey.questionRefs.push({ questionId: question._id, order: finalOrder });
    survey.questionRefs.sort((a, b) => a.order - b.order);
    await survey.save();

    res.status(201).json(question);
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ error: messages.join('; ') });
    }
    res.status(500).json({ error: '服务器错误' });
  }
});

// GET /api/surveys/:surveyId/questions - 获取问卷引用的所有题目（按 order 排序）
router.get('/surveys/:surveyId/questions', auth, async (req, res) => {
  try {
    const survey = await Survey.findById(req.params.surveyId);
    if (!survey) {
      return res.status(404).json({ error: '问卷不存在' });
    }
    if (survey.creatorId.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: '无权限访问' });
    }

    // 按 order 排序获取题目
    const refs = [...survey.questionRefs].sort((a, b) => a.order - b.order);
    const questionIds = refs.map(ref => ref.questionId); 
    const questions = await Question.find({ _id: { $in: questionIds } });

    // 按 order 排序并附加 order 信息
    const questionMap = {};
    for (const q of questions) {
      questionMap[q._id.toString()] = q;
    }

    const result = refs.map(ref => {
      const q = questionMap[ref.questionId.toString()];
      if (!q) return null;
      return {
        ...q.toObject(),
        order: ref.order,
      };
    }).filter(Boolean);

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// PUT /api/surveys/:surveyId/questions/reorder - 调整题目顺序
router.put('/surveys/:surveyId/questions/reorder', auth, async (req, res) => {
  try {
    const survey = await Survey.findById(req.params.surveyId);
    if (!survey) {
      return res.status(404).json({ error: '问卷不存在' });
    }
    if (survey.creatorId.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: '无权限操作' });
    }
    if (survey.status !== 'draft') {
      return res.status(400).json({ error: '只能在草稿状态调整顺序' });
    }

    const { orders } = req.body; // [{questionId, order}]
    if (!Array.isArray(orders)) {
      return res.status(400).json({ error: 'orders 应为数组' });
    }

    for (const item of orders) {
      const ref = survey.questionRefs.find(
        r => r.questionId.toString() === item.questionId,
      );
      if (ref) {
        ref.order = item.order;
      }
    }

    survey.questionRefs.sort((a, b) => a.order - b.order);
    await survey.save();
    res.json(survey);
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// DELETE /api/surveys/:surveyId/questions/:questionId - 从问卷移除题目引用
router.delete('/surveys/:surveyId/questions/:questionId', auth, async (req, res) => {
  try {
    const survey = await Survey.findById(req.params.surveyId);
    if (!survey) {
      return res.status(404).json({ error: '问卷不存在' });
    }
    if (survey.creatorId.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: '无权限操作' });
    }
    if (survey.status !== 'draft') {
      return res.status(400).json({ error: '只能在草稿状态移除题目' });
    }

    const idx = survey.questionRefs.findIndex(
      ref => ref.questionId.toString() === req.params.questionId,
    );
    if (idx === -1) {
      return res.status(404).json({ error: '该题目不在问卷中' });
    }

    const removedOrder = survey.questionRefs[idx].order;
    survey.questionRefs.splice(idx, 1);
    await survey.save();

    res.json({ message: '已从问卷移除' });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// PUT /api/questions/:id - 更新题目（保留兼容路由用于问卷内编辑）
router.put('/questions/:id', auth, async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) {
      return res.status(404).json({ error: '题目不存在' });
    }

    const isOwner = question.creatorId.toString() === req.userId.toString();
    if (!isOwner) {
      return res.status(403).json({ error: '无权限操作' });
    }

    // 检查是否有已发布问卷引用
    const publishedRefs = await Survey.find({
      'questionRefs.questionId': question._id,
      status: { $in: ['published', 'closed'] },
    });

    if (publishedRefs.length > 0) {
      return res.status(400).json({
        error: '该题目被已发布问卷引用，请通过题目库修改（会自动创建新版本）',
      });
    }

    // 检查问卷是否是 draft
    const draftRefs = await Survey.find({
      'questionRefs.questionId': question._id,
      status: 'draft',
    });

    // draft 状态的问卷可以直接修改
    const { type, title, required, options, validation, jumpRules } = req.body;
    if (type !== undefined) question.type = type;
    if (title !== undefined) question.title = title;
    if (required !== undefined) question.required = required;
    if (options !== undefined) question.options = options;
    if (validation !== undefined) question.validation = validation;
    if (jumpRules !== undefined) question.jumpRules = jumpRules;

    await question.save();
    res.json(question);
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// DELETE /api/questions/:id - 删除题目（兼容路由，从所属 draft 问卷中移除引用）
router.delete('/questions/:id', auth, async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) {
      return res.status(404).json({ error: '题目不存在' });
    }

    const isOwner = question.creatorId.toString() === req.userId.toString();
    if (!isOwner) {
      return res.status(403).json({ error: '无权限操作' });
    }

    // 检查关联的问卷（通过 query param 获取 surveyId 来确定从哪个问卷移除）
    const { surveyId } = req.query;
    if (surveyId) {
      const survey = await Survey.findById(surveyId);
      if (survey && survey.status !== 'draft') {
        return res.status(400).json({ error: '只能在草稿状态删除题目' });
      }

      if (survey) {
        // 从问卷移除引用
        survey.questionRefs = survey.questionRefs.filter(
          ref => ref.questionId.toString() !== question._id.toString(),
        );
        await survey.save();
      }
    }

    // 检查该题还有没有其他问卷引用
    const otherRefs = await Survey.find({
      'questionRefs.questionId': question._id,
    });

    if (otherRefs.length === 0) {
      // 如果没有其他引用且用户确认，可以从数据库删除题目本身
      // 这里不实际删除题目本体（保留在题目库中），只从问卷移除
    }

    res.json({ message: '题目已删除' });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
