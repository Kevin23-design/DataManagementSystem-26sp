const express = require('express');
const mongoose = require('mongoose');
const Question = require('../models/Question');
const Survey = require('../models/Survey');
const Response = require('../models/Response');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

const router = express.Router();

// POST /api/questions - 创建独立题目
router.post('/', auth, async (req, res) => {
  try {
    const { type, title, required, options, validation, jumpRules } = req.body;

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
    res.status(201).json(question);
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ error: messages.join('; ') });
    }
    res.status(500).json({ error: '服务器错误' });
  }
});

// GET /api/questions - 获取我的题目列表（含被共享的）
router.get('/', auth, async (req, res) => {
  try {
    const { latest, rootId } = req.query;

    const filter = {
      $or: [
        { creatorId: req.userId },
        { sharedWith: req.userId },
      ],
    };

    // 默认只显示最新版本
    if (latest !== 'false') {
      filter.isLatest = true;
    }

    // 按 rootId 筛选某题的所有版本
    if (rootId) {
      filter.rootQuestionId = rootId;
      delete filter.isLatest; // 查版本时显示所有
    }

    const questions = await Question.find(filter).sort({ createdAt: -1 });
    res.json(questions);
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// GET /api/questions/:id - 获取题目详情
router.get('/:id', auth, async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) {
      return res.status(404).json({ error: '题目不存在' });
    }

    // 检查权限：创建者或被共享者
    const isOwner = question.creatorId.toString() === req.userId.toString();
    const isShared = question.sharedWith.some(id => id.toString() === req.userId.toString());
    if (!isOwner && !isShared) {
      return res.status(403).json({ error: '无权限访问' });
    }

    res.json(question);
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// PUT /api/questions/:id - 更新题目
// 如果有已发布问卷引用此题目，则创建新版本；否则直接修改
router.put('/:id', auth, async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) {
      return res.status(404).json({ error: '题目不存在' });
    }
    if (question.creatorId.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: '无权限操作' });
    }

    // 检查是否有已发布问卷引用此题
    const publishedSurveys = await Survey.find({
      'questionRefs.questionId': question._id,
      status: { $in: ['published', 'closed'] },
    });

    const { type, title, required, options, validation, jumpRules, forceNewVersion } = req.body;

    if (publishedSurveys.length > 0 || forceNewVersion) {
      // 创建新版本
      const rootId = question.rootQuestionId || question._id;

      // 把当前版本的 isLatest 设为 false
      await Question.updateOne({ _id: question._id }, { $set: { isLatest: false } });

      const newVersion = new Question({
        creatorId: question.creatorId,
        sharedWith: question.sharedWith,
        rootQuestionId: rootId,
        parentVersionId: question._id,
        version: question.version + 1,
        isLatest: true,
        type: type !== undefined ? type : question.type,
        title: title !== undefined ? title : question.title,
        required: required !== undefined ? required : question.required,
        options: options !== undefined ? options : question.options,
        validation: validation !== undefined ? validation : question.validation,
        jumpRules: jumpRules !== undefined ? jumpRules : question.jumpRules,
      });

      await newVersion.save();

      // 更新未发布问卷中对旧版本的引用到新版本
      await Survey.updateMany(
        { 'questionRefs.questionId': question._id, status: 'draft' },
        { $set: { 'questionRefs.$[elem].questionId': newVersion._id } },
        { arrayFilters: [{ 'elem.questionId': question._id }] },
      );

      return res.json({ question: newVersion, newVersionCreated: true });
    }

    // 无已发布引用，直接修改
    if (type !== undefined) question.type = type;
    if (title !== undefined) question.title = title;
    if (required !== undefined) question.required = required;
    if (options !== undefined) question.options = options;
    if (validation !== undefined) question.validation = validation;
    if (jumpRules !== undefined) question.jumpRules = jumpRules;

    await question.save();
    res.json({ question, newVersionCreated: false });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// DELETE /api/questions/:id - 删除题目
router.delete('/:id', auth, async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) {
      return res.status(404).json({ error: '题目不存在' });
    }
    if (question.creatorId.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: '无权限操作' });
    }

    // 检查是否有问卷引用
    const referencedSurveys = await Survey.find({
      'questionRefs.questionId': question._id,
    });

    if (referencedSurveys.length > 0) {
      return res.status(400).json({
        error: '该题目被问卷引用中，无法删除',
        surveys: referencedSurveys.map(s => ({ _id: s._id, title: s.title, status: s.status })),
      });
    }

    await Question.findByIdAndDelete(question._id);
    res.json({ message: '题目已删除' });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// POST /api/questions/:id/share - 共享题目给用户
router.post('/:id/share', auth, async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) {
      return res.status(404).json({ error: '题目不存在' });
    }
    if (question.creatorId.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: '只有创建者可以共享' });
    }

    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ error: '请提供用户名' });
    }

    const targetUser = await User.findOne({ username });
    if (!targetUser) {
      return res.status(404).json({ error: '用户不存在' });
    }

    if (targetUser._id.toString() === req.userId.toString()) {
      return res.status(400).json({ error: '不能共享给自己' });
    }

    // 共享所有版本（通过 rootQuestionId）
    const rootId = question.rootQuestionId || question._id;
    await Question.updateMany(
      { $or: [{ _id: rootId }, { rootQuestionId: rootId }] },
      { $addToSet: { sharedWith: targetUser._id } },
    );

    res.json({ message: `已共享给 ${username}` });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// DELETE /api/questions/:id/share/:userId - 取消共享
router.delete('/:id/share/:userId', auth, async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) {
      return res.status(404).json({ error: '题目不存在' });
    }
    if (question.creatorId.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: '只有创建者可以取消共享' });
    }

    const rootId = question.rootQuestionId || question._id;
    await Question.updateMany(
      { $or: [{ _id: rootId }, { rootQuestionId: rootId }] },
      { $pull: { sharedWith: new mongoose.Types.ObjectId(req.params.userId) } },
    );

    res.json({ message: '已取消共享' });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// GET /api/questions/:id/versions - 获取版本历史
router.get('/:id/versions', auth, async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) {
      return res.status(404).json({ error: '题目不存在' });
    }

    const rootId = question.rootQuestionId || question._id;
    const versions = await Question.find({
      $or: [{ _id: rootId }, { rootQuestionId: rootId }],
    }).sort({ version: 1 });

    res.json(versions);
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// POST /api/questions/:id/revert/:versionId - 恢复到某个旧版本（创建新版本）
router.post('/:id/revert/:versionId', auth, async (req, res) => {
  try {
    const current = await Question.findById(req.params.id);
    if (!current) {
      return res.status(404).json({ error: '题目不存在' });
    }
    if (current.creatorId.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: '无权限操作' });
    }

    const oldVersion = await Question.findById(req.params.versionId);
    if (!oldVersion) {
      return res.status(404).json({ error: '目标版本不存在' });
    }

    const rootId = current.rootQuestionId || current._id;

    // 找当前最新版本号
    const latest = await Question.findOne({ rootQuestionId: rootId, isLatest: true });
    const maxVersion = latest ? latest.version : current.version;

    // 把当前最新设为非最新
    if (latest) {
      await Question.updateOne({ _id: latest._id }, { $set: { isLatest: false } });
    }

    // 创建新版本，内容来自旧版本
    const reverted = new Question({
      creatorId: current.creatorId,
      sharedWith: current.sharedWith,
      rootQuestionId: rootId,
      parentVersionId: oldVersion._id,
      version: maxVersion + 1,
      isLatest: true,
      type: oldVersion.type,
      title: oldVersion.title,
      required: oldVersion.required,
      options: oldVersion.options,
      validation: oldVersion.validation,
      jumpRules: oldVersion.jumpRules,
    });

    await reverted.save();
    res.json(reverted);
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// GET /api/questions/:id/surveys - 查看题目被哪些问卷使用
router.get('/:id/surveys', auth, async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) {
      return res.status(404).json({ error: '题目不存在' });
    }

    // 查找该题及所有版本的 ID
    const rootId = question.rootQuestionId || question._id;
    const allVersions = await Question.find({
      $or: [{ _id: rootId }, { rootQuestionId: rootId }],
    }).select('_id');
    const allIds = allVersions.map(q => q._id);

    const surveys = await Survey.find({
      'questionRefs.questionId': { $in: allIds },
    }).select('_id title status createdAt');

    res.json(surveys);
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// GET /api/questions/:id/stats - 跨问卷单题统计
router.get('/:id/stats', auth, async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) {
      return res.status(404).json({ error: '题目不存在' });
    }

    // 查找同根所有版本的 ID
    const rootId = question.rootQuestionId || question._id;
    const allVersions = await Question.find({
      $or: [{ _id: rootId }, { rootQuestionId: rootId }],
    }).select('_id');
    const allIds = allVersions.map(q => q._id);

    // 找到所有引用了这些版本的问卷
    const surveys = await Survey.find({
      'questionRefs.questionId': { $in: allIds },
    }).select('_id title status');
    const surveyIds = surveys.map(s => s._id);

    // 构建 surveyId -> title 映射
    const surveyMap = {};
    for (const s of surveys) {
      surveyMap[s._id.toString()] = { title: s.title, status: s.status };
    }

    // 拿所有 response
    const responses = await Response.find({ surveyId: { $in: surveyIds } });

    // 收集所有答案（同时记录来源问卷）
    const answeredValues = [];
    const perSurveyValues = {}; // surveyId -> [values]
    const allIdStrs = allIds.map(id => id.toString());

    for (const resp of responses) {
      const sid = resp.surveyId.toString();
      for (const ans of resp.answers) {
        if (allIdStrs.includes(ans.questionId.toString())) {
          answeredValues.push(ans.value);
          if (!perSurveyValues[sid]) perSurveyValues[sid] = [];
          perSurveyValues[sid].push(ans.value);
        }
      }
    }

    const stat = {
      questionId: question._id,
      rootQuestionId: rootId,
      title: question.title,
      type: question.type,
      totalAnswered: answeredValues.length,
      totalSurveys: surveys.length,
    };

    // 全局统计
    switch (question.type) {
      case 'single_choice': {
        const optionCounts = {};
        for (const opt of question.options) optionCounts[opt] = 0;
        for (const val of answeredValues) {
          if (optionCounts[val] !== undefined) optionCounts[val]++;
        }
        stat.optionCounts = optionCounts;
        break;
      }
      case 'multiple_choice': {
        const optionCounts = {};
        for (const opt of question.options) optionCounts[opt] = 0;
        for (const val of answeredValues) {
          if (Array.isArray(val)) {
            for (const v of val) {
              if (optionCounts[v] !== undefined) optionCounts[v]++;
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

    // 按问卷分组统计
    stat.perSurvey = [];
    for (const [sid, values] of Object.entries(perSurveyValues)) {
      const info = surveyMap[sid] || { title: '未知问卷', status: 'unknown' };
      const surveyStatItem = {
        surveyId: sid,
        surveyTitle: info.title,
        surveyStatus: info.status,
        answerCount: values.length,
        proportion: answeredValues.length > 0
          ? +(values.length / answeredValues.length * 100).toFixed(1)
          : 0,
      };

      // 每个问卷内的选项分布
      if (question.type === 'single_choice' || question.type === 'multiple_choice') {
        const oc = {};
        for (const opt of question.options) oc[opt] = 0;
        for (const val of values) {
          if (question.type === 'multiple_choice' && Array.isArray(val)) {
            for (const v of val) { if (oc[v] !== undefined) oc[v]++; }
          } else {
            if (oc[val] !== undefined) oc[val]++;
          }
        }
        surveyStatItem.optionCounts = oc;
      }

      if (question.type === 'number_input') {
        const nums = values.map(Number).filter(n => !isNaN(n));
        if (nums.length > 0) {
          surveyStatItem.average = +(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2);
          surveyStatItem.min = Math.min(...nums);
          surveyStatItem.max = Math.max(...nums);
        }
      }

      if (question.type === 'text_input') {
        surveyStatItem.answers = values;
      }

      stat.perSurvey.push(surveyStatItem);
    }

    res.json(stat);
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
