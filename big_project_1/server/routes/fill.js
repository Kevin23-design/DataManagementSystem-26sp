const express = require('express');
const Survey = require('../models/Survey');
const Question = require('../models/Question');
const Response = require('../models/Response');
const { auth, optionalAuth } = require('../middleware/auth');
const { validateAnswer } = require('../utils/validation');
const { getNextQuestionOrder } = require('../utils/jumpLogic');

const router = express.Router();

// GET /api/survey/:shareCode - 通过分享链接获取问卷和题目
router.get('/:shareCode', optionalAuth, async (req, res) => {
  try {
    const survey = await Survey.findOne({ shareCode: req.params.shareCode });
    if (!survey) {
      return res.status(404).json({ error: '问卷不存在' });
    }
    if (survey.status !== 'published') {
      return res.status(400).json({ error: '问卷未发布或已关闭' });
    }
    if (survey.deadline && new Date() > new Date(survey.deadline)) {
      return res.status(400).json({ error: '问卷已截止' });
    }

    // 非匿名问卷需要登录
    if (!survey.allowAnonymous && !req.userId) {
      return res.status(401).json({ error: '该问卷需要登录后填写' });
    }

    const questions = await Question.find({ surveyId: survey._id }).sort({ order: 1 });

    res.json({
      survey: {
        _id: survey._id,
        title: survey.title,
        description: survey.description,
        allowAnonymous: survey.allowAnonymous,
      },
      questions,
    });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// POST /api/survey/:shareCode/submit - 提交问卷回答
router.post('/:shareCode/submit', optionalAuth, async (req, res) => {
  try {
    const survey = await Survey.findOne({ shareCode: req.params.shareCode });
    if (!survey) {
      return res.status(404).json({ error: '问卷不存在' });
    }
    if (survey.status !== 'published') {
      return res.status(400).json({ error: '问卷未发布或已关闭' });
    }
    if (survey.deadline && new Date() > new Date(survey.deadline)) {
      return res.status(400).json({ error: '问卷已截止' });
    }
    if (!survey.allowAnonymous && !req.userId) {
      return res.status(401).json({ error: '该问卷需要登录后填写' });
    }

    const questions = await Question.find({ surveyId: survey._id }).sort({ order: 1 });
    const { answers: submittedAnswers } = req.body;

    if (!submittedAnswers || !Array.isArray(submittedAnswers)) {
      return res.status(400).json({ error: 'answers 应为数组' });
    }

    // 构建 answers map: questionId -> value
    const answerMap = {};
    for (const ans of submittedAnswers) {
      answerMap[ans.questionId] = ans.value;
    }

    // 模拟填写过程，按跳转逻辑验证
    const validatedAnswers = [];
    let currentIdx = 0;

    while (currentIdx < questions.length) {
      const question = questions[currentIdx];
      const value = answerMap[question._id.toString()];

      // 校验答案
      const result = validateAnswer(question, value);
      if (!result.valid) {
        return res.status(400).json({ error: result.message });
      }

      // 记录有效答案
      if (value !== undefined && value !== null && value !== '') {
        validatedAnswers.push({
          questionId: question._id,
          questionOrder: question.order,
          value,
        });
      }

      // 计算下一题
      const defaultNextOrder = currentIdx + 1 < questions.length
        ? questions[currentIdx + 1].order
        : null;

      const nextOrder = getNextQuestionOrder(question, value, defaultNextOrder);

      if (nextOrder === null) {
        break; // 结束
      }

      // 查找下一题的索引
      const nextIdx = questions.findIndex(q => q.order === nextOrder);
      if (nextIdx === -1) {
        break; // 跳转目标不存在，结束
      }
      currentIdx = nextIdx;
    }

    // 保存回答
    const response = new Response({
      surveyId: survey._id,
      respondentId: req.userId || null,
      answers: validatedAnswers,
    });
    await response.save();

    res.status(201).json({ message: '提交成功', responseId: response._id });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
