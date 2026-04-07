require('dotenv').config();

const mongoose = require('mongoose');
const request = require('supertest');

const app = require('../app');
const Survey = require('../models/Survey');
const Question = require('../models/Question');
const Response = require('../models/Response');
const QuestionBank = require('../models/QuestionBank');

const TEST_DB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/survey_system_test';
const TEST_PASSWORD = 'test123456';

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'survey_system_test_secret';
}

async function registerAndGetToken(username) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ username, password: TEST_PASSWORD });

  expect(res.statusCode).toBe(201);
  expect(res.body).toHaveProperty('token');
  return { token: res.body.token, userId: res.body.user._id };
}

async function createSurvey(token, payload = {}) {
  const body = {
    title: payload.title || '测试问卷',
    description: payload.description || '测试描述',
    allowAnonymous: payload.allowAnonymous !== undefined ? payload.allowAnonymous : true,
    deadline: payload.deadline || null,
  };

  const res = await request(app)
    .post('/api/surveys')
    .set('Authorization', `Bearer ${token}`)
    .send(body);

  expect(res.statusCode).toBe(201);
  return res.body;
}

async function createQuestion(token, body) {
  const res = await request(app)
    .post('/api/questions')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
  expect(res.statusCode).toBe(201);
  return res.body;
}

async function addQuestionToSurvey(token, surveyId, questionId) {
  const res = await request(app)
    .post(`/api/surveys/${surveyId}/questions`)
    .set('Authorization', `Bearer ${token}`)
    .send({ questionId });
  return res;
}

async function addNewQuestionToSurvey(token, surveyId, body) {
  return request(app)
    .post(`/api/surveys/${surveyId}/questions/new`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

async function publishSurvey(token, surveyId) {
  const res = await request(app)
    .put(`/api/surveys/${surveyId}/publish`)
    .set('Authorization', `Bearer ${token}`)
    .send();

  expect(res.statusCode).toBe(200);
  return res.body;
}

describe('问卷系统 v1.2 完整版测试', () => {
  beforeAll(async () => {
    await mongoose.connect(TEST_DB_URI);
  });

  afterEach(async () => {
    const collections = Object.values(mongoose.connection.collections);
    for (const collection of collections) {
      await collection.deleteMany({});
    }
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  // ============================================================
  // 原有功能兼容测试
  // ============================================================

  describe('1) 创建问卷测试', () => {
    test('创建问卷成功（已登录）', async () => {
      const { token } = await registerAndGetToken('u_create_ok');

      const res = await request(app)
        .post('/api/surveys')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: '课程反馈', description: 'desc', allowAnonymous: true });

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('_id');
      expect(res.body).toHaveProperty('shareCode');
      expect(res.body.status).toBe('draft');
    });

    test('创建问卷失败（未登录）', async () => {
      const res = await request(app)
        .post('/api/surveys')
        .send({ title: '未授权创建' });

      expect(res.statusCode).toBe(401);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('2) 添加题目测试（新模式：从题目库/直接新建）', () => {
    test('可在问卷内直接新建四类题型', async () => {
      const { token } = await registerAndGetToken('u_add_q_new');
      const survey = await createSurvey(token, { title: '题型测试' });

      const qBodies = [
        { type: 'single_choice', title: '你的性别', required: true, options: ['男', '女', '其他'] },
        { type: 'multiple_choice', title: '喜欢的水果', required: true, options: ['苹果', '香蕉', '西瓜', '葡萄'], validation: { minSelect: 2, maxSelect: 3 } },
        { type: 'text_input', title: '意见建议', required: false, validation: { minLength: 2, maxLength: 50 } },
        { type: 'number_input', title: '年龄', required: true, validation: { min: 0, max: 120, integerOnly: true } },
      ];

      for (const body of qBodies) {
        const res = await addNewQuestionToSurvey(token, survey._id, body);
        expect(res.statusCode).toBe(201);
      }

      const listRes = await request(app)
        .get(`/api/surveys/${survey._id}/questions`)
        .set('Authorization', `Bearer ${token}`);

      expect(listRes.statusCode).toBe(200);
      expect(listRes.body).toHaveLength(4);
      expect(listRes.body.map(q => q.type)).toEqual([
        'single_choice', 'multiple_choice', 'text_input', 'number_input',
      ]);
    });

    test('可从题目库选题添加到问卷', async () => {
      const { token } = await registerAndGetToken('u_add_q_pick');
      const survey = await createSurvey(token, { title: '选题测试' });

      // 先在题目库创建题目
      const q = await createQuestion(token, {
        type: 'single_choice', title: '性别', required: true, options: ['男', '女'],
      });

      // 添加到问卷
      const addRes = await addQuestionToSurvey(token, survey._id, q._id);
      expect(addRes.statusCode).toBe(201);

      // 验证
      const listRes = await request(app)
        .get(`/api/surveys/${survey._id}/questions`)
        .set('Authorization', `Bearer ${token}`);
      expect(listRes.body).toHaveLength(1);
      expect(listRes.body[0]._id).toBe(q._id);
    });

    test('发布后不可添加题目', async () => {
      const { token } = await registerAndGetToken('u_add_q_forbidden');
      const survey = await createSurvey(token, { title: '发布态测试' });

      const res = await addNewQuestionToSurvey(token, survey._id, {
        type: 'single_choice', title: 'Q1', required: true, options: ['A', 'B'],
      });
      expect(res.statusCode).toBe(201);

      await publishSurvey(token, survey._id);

      const res2 = await addNewQuestionToSurvey(token, survey._id, {
        type: 'text_input', title: 'Q2',
      });
      expect(res2.statusCode).toBe(400);
      expect(res2.body.error).toContain('草稿');
    });
  });

  describe('3) 跳转逻辑测试', () => {
    test('命中单选跳转规则时跳过中间题', async () => {
      const { token } = await registerAndGetToken('u_jump_ok');
      const survey = await createSurvey(token, { title: '跳转测试', allowAnonymous: true });

      const q1 = (await addNewQuestionToSurvey(token, survey._id, {
        type: 'single_choice', title: '路径选择', required: true,
        options: ['A', 'B'],
        jumpRules: [{ condition: { type: 'equals', value: 'A' }, targetQuestionOrder: 3 }],
      })).body;

      const q2 = (await addNewQuestionToSurvey(token, survey._id, {
        type: 'text_input', title: '应该被跳过', required: true,
        validation: { minLength: 2 },
      })).body;

      const q3 = (await addNewQuestionToSurvey(token, survey._id, {
        type: 'text_input', title: '最终题', required: true,
        validation: { minLength: 2 },
      })).body;

      await publishSurvey(token, survey._id);

      const submitRes = await request(app)
        .post(`/api/survey/${survey.shareCode}/submit`)
        .send({
          answers: [
            { questionId: q1._id, value: 'A' },
            { questionId: q3._id, value: 'ok' },
          ],
        });

      expect(submitRes.statusCode).toBe(201);

      const saved = await Response.findById(submitRes.body.responseId).lean();
      const savedOrders = saved.answers.map(a => a.questionOrder);
      expect(savedOrders).toEqual([1, 3]);
    });

    test('不命中跳转规则时按默认顺序走下一题', async () => {
      const { token } = await registerAndGetToken('u_jump_default');
      const survey = await createSurvey(token, { title: '默认顺序测试', allowAnonymous: true });

      const q1 = (await addNewQuestionToSurvey(token, survey._id, {
        type: 'single_choice', title: '路径选择', required: true,
        options: ['A', 'B'],
        jumpRules: [{ condition: { type: 'equals', value: 'A' }, targetQuestionOrder: 3 }],
      })).body;

      const q2 = (await addNewQuestionToSurvey(token, survey._id, {
        type: 'text_input', title: '默认下一题', required: true,
        validation: { minLength: 2 },
      })).body;

      const q3 = (await addNewQuestionToSurvey(token, survey._id, {
        type: 'text_input', title: '第三题', required: true,
        validation: { minLength: 2 },
      })).body;

      await publishSurvey(token, survey._id);

      const submitRes = await request(app)
        .post(`/api/survey/${survey.shareCode}/submit`)
        .send({
          answers: [
            { questionId: q1._id, value: 'B' },
            { questionId: q2._id, value: 'ok' },
            { questionId: q3._id, value: 'ok' },
          ],
        });

      expect(submitRes.statusCode).toBe(201);

      const saved = await Response.findById(submitRes.body.responseId).lean();
      const savedOrders = saved.answers.map(a => a.questionOrder);
      expect(savedOrders).toEqual([1, 2, 3]);
    });
  });

  describe('4) 校验测试', () => {
    test('必答题为空时提交失败', async () => {
      const { token } = await registerAndGetToken('u_validate_required');
      const survey = await createSurvey(token, { title: '必答校验', allowAnonymous: true });

      const q1 = (await addNewQuestionToSurvey(token, survey._id, {
        type: 'single_choice', title: '必答单选', required: true, options: ['A', 'B'],
      })).body;

      await publishSurvey(token, survey._id);

      const submitRes = await request(app)
        .post(`/api/survey/${survey.shareCode}/submit`)
        .send({ answers: [{ questionId: q1._id, value: '' }] });

      expect(submitRes.statusCode).toBe(400);
      expect(submitRes.body.error).toContain('必答题');
    });

    test('多选数量与数字范围校验生效', async () => {
      const { token } = await registerAndGetToken('u_validate_rules');
      const survey = await createSurvey(token, { title: '规则校验', allowAnonymous: true });

      const q1 = (await addNewQuestionToSurvey(token, survey._id, {
        type: 'multiple_choice', title: '多选限制', required: true,
        options: ['苹果', '香蕉', '西瓜'], validation: { minSelect: 2, maxSelect: 2 },
      })).body;

      const q2 = (await addNewQuestionToSurvey(token, survey._id, {
        type: 'number_input', title: '年龄', required: true,
        validation: { min: 0, max: 120, integerOnly: true },
      })).body;

      await publishSurvey(token, survey._id);

      const badMulti = await request(app)
        .post(`/api/survey/${survey.shareCode}/submit`)
        .send({ answers: [{ questionId: q1._id, value: ['苹果'] }, { questionId: q2._id, value: 20 }] });
      expect(badMulti.statusCode).toBe(400);
      expect(badMulti.body.error).toContain('至少选择');

      const badNumber = await request(app)
        .post(`/api/survey/${survey.shareCode}/submit`)
        .send({ answers: [{ questionId: q1._id, value: ['苹果', '香蕉'] }, { questionId: q2._id, value: 121 }] });
      expect(badNumber.statusCode).toBe(400);
      expect(badNumber.body.error).toContain('不能大于');
    });
  });

  describe('5) 提交问卷测试', () => {
    test('匿名问卷可匿名提交，且可多次提交', async () => {
      const { token } = await registerAndGetToken('u_submit_anonymous');
      const survey = await createSurvey(token, { title: '匿名提交', allowAnonymous: true });

      const q1 = (await addNewQuestionToSurvey(token, survey._id, {
        type: 'single_choice', title: 'Q1', required: true, options: ['A', 'B'],
      })).body;

      await publishSurvey(token, survey._id);

      const s1 = await request(app)
        .post(`/api/survey/${survey.shareCode}/submit`)
        .send({ answers: [{ questionId: q1._id, value: 'A' }] });

      const s2 = await request(app)
        .post(`/api/survey/${survey.shareCode}/submit`)
        .send({ answers: [{ questionId: q1._id, value: 'B' }] });

      expect(s1.statusCode).toBe(201);
      expect(s2.statusCode).toBe(201);

      const count = await Response.countDocuments({ surveyId: survey._id });
      expect(count).toBe(2);
    });

    test('非匿名问卷未登录提交失败，登录后成功', async () => {
      const { token: tokenA } = await registerAndGetToken('u_submit_private_owner');
      const { token: tokenB } = await registerAndGetToken('u_submit_private_user');
      const survey = await createSurvey(tokenA, { title: '登录后提交', allowAnonymous: false });

      const q1 = (await addNewQuestionToSurvey(tokenA, survey._id, {
        type: 'single_choice', title: 'Q1', required: true, options: ['A', 'B'],
      })).body;

      await publishSurvey(tokenA, survey._id);

      const noAuth = await request(app)
        .post(`/api/survey/${survey.shareCode}/submit`)
        .send({ answers: [{ questionId: q1._id, value: 'A' }] });
      expect(noAuth.statusCode).toBe(401);

      const withAuth = await request(app)
        .post(`/api/survey/${survey.shareCode}/submit`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ answers: [{ questionId: q1._id, value: 'A' }] });
      expect(withAuth.statusCode).toBe(201);
    });
  });

  describe('6) 统计测试', () => {
    test('统计接口返回单选计数与数字聚合结果', async () => {
      const { token: ownerToken } = await registerAndGetToken('u_stats_owner');
      const survey = await createSurvey(ownerToken, { title: '统计测试', allowAnonymous: true });

      const q1 = (await addNewQuestionToSurvey(ownerToken, survey._id, {
        type: 'single_choice', title: '满意度', required: true, options: ['好', '一般'],
      })).body;

      const q2 = (await addNewQuestionToSurvey(ownerToken, survey._id, {
        type: 'number_input', title: '分数', required: true, validation: { min: 0, max: 100 },
      })).body;

      await publishSurvey(ownerToken, survey._id);

      await request(app)
        .post(`/api/survey/${survey.shareCode}/submit`)
        .send({ answers: [{ questionId: q1._id, value: '好' }, { questionId: q2._id, value: 80 }] });
      await request(app)
        .post(`/api/survey/${survey.shareCode}/submit`)
        .send({ answers: [{ questionId: q1._id, value: '一般' }, { questionId: q2._id, value: 60 }] });

      const statsRes = await request(app)
        .get(`/api/surveys/${survey._id}/stats`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(statsRes.statusCode).toBe(200);
      expect(statsRes.body.totalResponses).toBe(2);

      const singleStat = statsRes.body.questions.find(q => q.questionId === String(q1._id));
      const numberStat = statsRes.body.questions.find(q => q.questionId === String(q2._id));

      expect(singleStat.optionCounts['好']).toBe(1);
      expect(singleStat.optionCounts['一般']).toBe(1);
      expect(numberStat.average).toBe(70);
      expect(numberStat.min).toBe(60);
      expect(numberStat.max).toBe(80);
    });

    test('非创建者无权限查看统计', async () => {
      const { token: ownerToken } = await registerAndGetToken('u_stats_owner2');
      const { token: otherToken } = await registerAndGetToken('u_stats_other');
      const survey = await createSurvey(ownerToken, { title: '统计权限测试' });

      const qRes = await addNewQuestionToSurvey(ownerToken, survey._id, {
        type: 'single_choice', title: 'Q1', required: true, options: ['A', 'B'],
      });
      expect(qRes.statusCode).toBe(201);

      await publishSurvey(ownerToken, survey._id);

      const forbidden = await request(app)
        .get(`/api/surveys/${survey._id}/stats`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(forbidden.statusCode).toBe(403);
      expect(forbidden.body.error).toContain('无权限');
    });
  });

  // ============================================================
  // 新增功能测试
  // ============================================================

  describe('7) 题目独立管理测试', () => {
    test('可创建独立题目并列出', async () => {
      const { token } = await registerAndGetToken('u_lib_create');

      const q = await createQuestion(token, {
        type: 'single_choice', title: '独立题目', required: true, options: ['A', 'B'],
      });
      expect(q).toHaveProperty('_id');
      expect(q.version).toBe(1);
      expect(q.isLatest).toBe(true);

      const listRes = await request(app)
        .get('/api/questions')
        .set('Authorization', `Bearer ${token}`);
      expect(listRes.body.length).toBeGreaterThanOrEqual(1);
    });

    test('一个题目可被多个问卷使用', async () => {
      const { token } = await registerAndGetToken('u_lib_multi');

      const q = await createQuestion(token, {
        type: 'single_choice', title: '共用题', required: true, options: ['X', 'Y'],
      });

      const survey1 = await createSurvey(token, { title: '问卷A' });
      const survey2 = await createSurvey(token, { title: '问卷B' });

      const add1 = await addQuestionToSurvey(token, survey1._id, q._id);
      const add2 = await addQuestionToSurvey(token, survey2._id, q._id);

      expect(add1.statusCode).toBe(201);
      expect(add2.statusCode).toBe(201);
    });
  });

  describe('8) 题目共享测试', () => {
    test('可共享题目给其他用户', async () => {
      const { token: tokenA } = await registerAndGetToken('u_share_owner');
      const { token: tokenB } = await registerAndGetToken('u_share_target');

      const q = await createQuestion(tokenA, {
        type: 'text_input', title: '共享题', required: false,
      });

      // 共享
      const shareRes = await request(app)
        .post(`/api/questions/${q._id}/share`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ username: 'u_share_target' });
      expect(shareRes.statusCode).toBe(200);

      // B 用户应该能看到
      const listRes = await request(app)
        .get('/api/questions')
        .set('Authorization', `Bearer ${tokenB}`);
      const found = listRes.body.find(item => item._id === q._id);
      expect(found).toBeTruthy();
    });
  });

  describe('9) 版本管理测试', () => {
    test('修改被已发布问卷引用的题目时创建新版本', async () => {
      const { token } = await registerAndGetToken('u_ver_create');

      const q = await createQuestion(token, {
        type: 'single_choice', title: '原题v1', required: true, options: ['A', 'B'],
      });

      const survey = await createSurvey(token, { title: '版本测试' });
      await addQuestionToSurvey(token, survey._id, q._id);
      await publishSurvey(token, survey._id);

      // 修改题目 → 应该创建新版本
      const updateRes = await request(app)
        .put(`/api/questions/${q._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: '改题v2' });

      expect(updateRes.statusCode).toBe(200);
      expect(updateRes.body.newVersionCreated).toBe(true);
      expect(updateRes.body.question.version).toBe(2);
      expect(updateRes.body.question.title).toBe('改题v2');

      // 原已发布问卷仍然引用旧版本
      const pubSurvey = await Survey.findById(survey._id);
      const refId = pubSurvey.questionRefs[0].questionId.toString();
      expect(refId).toBe(q._id); // 旧版本ID
    });

    test('可查看版本历史', async () => {
      const { token } = await registerAndGetToken('u_ver_history');

      const q = await createQuestion(token, {
        type: 'text_input', title: '版本历史题', required: false,
      });

      // 强制创建新版本
      await request(app)
        .put(`/api/questions/${q._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: '版本历史题v2', forceNewVersion: true });

      const versionsRes = await request(app)
        .get(`/api/questions/${q._id}/versions`)
        .set('Authorization', `Bearer ${token}`);

      expect(versionsRes.statusCode).toBe(200);
      expect(versionsRes.body.length).toBe(2);
      expect(versionsRes.body[0].version).toBe(1);
      expect(versionsRes.body[1].version).toBe(2);
    });

    test('可恢复旧版本', async () => {
      const { token } = await registerAndGetToken('u_ver_revert');

      const q = await createQuestion(token, {
        type: 'text_input', title: '原始标题', required: false,
      });

      // 创建新版本
      const updateRes = await request(app)
        .put(`/api/questions/${q._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: '新标题', forceNewVersion: true });

      const v2Id = updateRes.body.question._id;

      // 恢复到原始版本
      const revertRes = await request(app)
        .post(`/api/questions/${v2Id}/revert/${q._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(revertRes.statusCode).toBe(200);
      expect(revertRes.body.version).toBe(3);
      expect(revertRes.body.title).toBe('原始标题');
    });
  });

  describe('10) 修改不影响已发布问卷', () => {
    test('已发布问卷保持旧版本题目', async () => {
      const { token } = await registerAndGetToken('u_immutable');

      const q = await createQuestion(token, {
        type: 'single_choice', title: '旧题', required: true, options: ['旧A', '旧B'],
      });

      const survey = await createSurvey(token, { title: '不可变测试', allowAnonymous: true });
      await addQuestionToSurvey(token, survey._id, q._id);
      await publishSurvey(token, survey._id);

      // 修改题目（会创建新版本）
      await request(app)
        .put(`/api/questions/${q._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: '新题', options: ['新A', '新B'] });

      // 通过 shareCode 获取问卷 → 应该还是旧题
      const fillRes = await request(app)
        .get(`/api/survey/${survey.shareCode}`);

      expect(fillRes.statusCode).toBe(200);
      expect(fillRes.body.questions[0].title).toBe('旧题');
      expect(fillRes.body.questions[0].options).toEqual(['旧A', '旧B']);
    });
  });

  describe('11) 查看题目引用', () => {
    test('可查看题目被哪些问卷使用', async () => {
      const { token } = await registerAndGetToken('u_refs');

      const q = await createQuestion(token, {
        type: 'text_input', title: '引用测试题', required: false,
      });

      const survey1 = await createSurvey(token, { title: '引用问卷1' });
      const survey2 = await createSurvey(token, { title: '引用问卷2' });

      await addQuestionToSurvey(token, survey1._id, q._id);
      await addQuestionToSurvey(token, survey2._id, q._id);

      const refsRes = await request(app)
        .get(`/api/questions/${q._id}/surveys`)
        .set('Authorization', `Bearer ${token}`);

      expect(refsRes.statusCode).toBe(200);
      expect(refsRes.body).toHaveLength(2);
    });
  });

  describe('12) 题库测试', () => {
    test('可创建题库并添加题目', async () => {
      const { token } = await registerAndGetToken('u_bank');

      // 创建题库
      const bankRes = await request(app)
        .post('/api/question-banks')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '常用题库', description: '测试用' });
      expect(bankRes.statusCode).toBe(201);
      const bankId = bankRes.body._id;

      // 创建题目
      const q = await createQuestion(token, {
        type: 'single_choice', title: '题库题', required: true, options: ['X', 'Y'],
      });

      // 添加到题库
      const addRes = await request(app)
        .post(`/api/question-banks/${bankId}/questions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ questionId: q._id });
      expect(addRes.statusCode).toBe(200);

      // 查看题库详情
      const detailRes = await request(app)
        .get(`/api/question-banks/${bankId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(detailRes.statusCode).toBe(200);
      expect(detailRes.body.questions).toHaveLength(1);
    });
  });

  describe('13) 跨问卷统计测试', () => {
    test('可查看题目在所有问卷中的回答统计', async () => {
      const { token } = await registerAndGetToken('u_cross_stats');

      const q = await createQuestion(token, {
        type: 'single_choice', title: '跨卷统计题', required: true, options: ['好', '差'],
      });

      // 两个问卷都用这个题
      const s1 = await createSurvey(token, { title: '跨卷1', allowAnonymous: true });
      const s2 = await createSurvey(token, { title: '跨卷2', allowAnonymous: true });

      await addQuestionToSurvey(token, s1._id, q._id);
      await addQuestionToSurvey(token, s2._id, q._id);

      await publishSurvey(token, s1._id);
      await publishSurvey(token, s2._id);

      // 提交
      await request(app).post(`/api/survey/${s1.shareCode}/submit`)
        .send({ answers: [{ questionId: q._id, value: '好' }] });
      await request(app).post(`/api/survey/${s2.shareCode}/submit`)
        .send({ answers: [{ questionId: q._id, value: '差' }] });
      await request(app).post(`/api/survey/${s2.shareCode}/submit`)
        .send({ answers: [{ questionId: q._id, value: '好' }] });

      // 跨问卷统计
      const statsRes = await request(app)
        .get(`/api/questions/${q._id}/stats`)
        .set('Authorization', `Bearer ${token}`);

      expect(statsRes.statusCode).toBe(200);
      expect(statsRes.body.totalAnswered).toBe(3);
      expect(statsRes.body.totalSurveys).toBe(2);
      expect(statsRes.body.optionCounts['好']).toBe(2);
      expect(statsRes.body.optionCounts['差']).toBe(1);
    });
  });
});
