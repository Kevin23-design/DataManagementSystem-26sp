const express = require('express');
const mongoose = require('mongoose');
const Survey = require('../models/Survey');
const Question = require('../models/Question');
const Response = require('../models/Response');
const { auth } = require('../middleware/auth');

const router = express.Router();

// GET /api/surveys/:id/stats - 获取整卷统计
router.get('/:id/stats', auth, async (req, res) => {
  try {
    const survey = await Survey.findById(req.params.id);
    if (!survey) {
      return res.status(404).json({ error: '问卷不存在' });
    }
    if (survey.creatorId.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: '无权限查看统计' });
    }

    const questions = await Question.find({ surveyId: survey._id }).sort({ order: 1 });
    const responses = await Response.find({ surveyId: survey._id });

    const totalResponses = responses.length;
    const questionStats = [];

    for (const question of questions) {
      const stat = await getQuestionStats(question, responses);
      questionStats.push(stat);
    }

    res.json({
      surveyId: survey._id,
      title: survey.title,
      totalResponses,
      questions: questionStats,
    });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// GET /api/surveys/:id/stats/:questionId - 获取单题统计
router.get('/:id/stats/:questionId', auth, async (req, res) => {
  try {
    const survey = await Survey.findById(req.params.id);
    if (!survey) {
      return res.status(404).json({ error: '问卷不存在' });
    }
    if (survey.creatorId.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: '无权限查看统计' });
    }

    const question = await Question.findById(req.params.questionId);
    if (!question || question.surveyId.toString() !== survey._id.toString()) {
      return res.status(404).json({ error: '题目不存在' });
    }

    const responses = await Response.find({ surveyId: survey._id });
    const stat = await getQuestionStats(question, responses);
    res.json(stat);
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

/**
 * 计算单道题的统计数据
 */
async function getQuestionStats(question, responses) {
  const qId = question._id.toString();
  const answeredValues = [];

  for (const resp of responses) {
    const ans = resp.answers.find(a => a.questionId.toString() === qId);
    if (ans) {
      answeredValues.push(ans.value);
    }
  }

  const stat = {
    questionId: question._id,
    title: question.title,
    type: question.type,
    order: question.order,
    totalAnswered: answeredValues.length,
  };

  switch (question.type) {
    case 'single_choice': {
      const optionCounts = {};
      for (const opt of question.options) {
        optionCounts[opt] = 0;
      }
      for (const val of answeredValues) {
        if (optionCounts[val] !== undefined) {
          optionCounts[val]++;
        }
      }
      stat.optionCounts = optionCounts;
      break;
    }

    case 'multiple_choice': {
      const optionCounts = {};
      for (const opt of question.options) {
        optionCounts[opt] = 0;
      }
      for (const val of answeredValues) {
        if (Array.isArray(val)) {
          for (const v of val) {
            if (optionCounts[v] !== undefined) {
              optionCounts[v]++;
            }
          }
        }
      }
      stat.optionCounts = optionCounts;
      break;
    }

    case 'text_input': {
      stat.allAnswers = answeredValues;
      break;
    }

    case 'number_input': {
      const numbers = answeredValues.map(Number).filter(n => !isNaN(n));
      stat.allAnswers = answeredValues;
      if (numbers.length > 0) {
        stat.average = numbers.reduce((a, b) => a + b, 0) / numbers.length;
        stat.min = Math.min(...numbers);
        stat.max = Math.max(...numbers);
      }
      break;
    }
  }

  return stat;
}

module.exports = router;
