require('dotenv').config();

const mongoose = require('mongoose');
const request = require('supertest');

const app = require('../app');
const Survey = require('../models/Survey');
const Question = require('../models/Question');
const Response = require('../models/Response');

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
  return res.body.token;
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

async function addQuestion(token, surveyId, body) {
  return request(app)
    .post(`/api/surveys/${surveyId}/questions`)
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

describe('问卷系统完整版测试（API + 业务链路）', () => {
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

  describe('1) 创建问卷测试', () => {
    test('创建问卷成功（已登录）', async () => {
      const token = await registerAndGetToken('u_create_ok');

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

  describe('2) 添加题目测试', () => {
    test('可添加四类题型并正确保存', async () => {
      const token = await registerAndGetToken('u_add_q_ok');
      const survey = await createSurvey(token, { title: '题型测试' });

      const qBodies = [
        {
          type: 'single_choice',
          title: '你的性别',
          required: true,
          options: ['男', '女', '其他'],
        },
        {
          type: 'multiple_choice',
          title: '喜欢的水果',
          required: true,
          options: ['苹果', '香蕉', '西瓜', '葡萄'],
          validation: { minSelect: 2, maxSelect: 3 },
        },
        {
          type: 'text_input',
          title: '意见建议',
          required: false,
          validation: { minLength: 2, maxLength: 50 },
        },
        {
          type: 'number_input',
          title: '年龄',
          required: true,
          validation: { min: 0, max: 120, integerOnly: true },
        },
      ];

      for (const body of qBodies) {
        const res = await addQuestion(token, survey._id, body);
        expect(res.statusCode).toBe(201);
      }

      const listRes = await request(app)
        .get(`/api/surveys/${survey._id}/questions`)
        .set('Authorization', `Bearer ${token}`);

      expect(listRes.statusCode).toBe(200);
      expect(listRes.body).toHaveLength(4);
      expect(listRes.body.map(q => q.type)).toEqual([
        'single_choice',
        'multiple_choice',
        'text_input',
        'number_input',
      ]);
    });

    test('发布后不可添加题目', async () => {
      const token = await registerAndGetToken('u_add_q_forbidden');
      const survey = await createSurvey(token, { title: '发布态测试' });

      const firstRes = await addQuestion(token, survey._id, {
        type: 'single_choice',
        title: 'Q1',
        required: true,
        options: ['A', 'B'],
      });
      expect(firstRes.statusCode).toBe(201);

      await publishSurvey(token, survey._id);

      const res = await addQuestion(token, survey._id, {
        type: 'text_input',
        title: 'Q2',
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('草稿');
    });
  });

  describe('3) 跳转逻辑测试', () => {
    test('命中单选跳转规则时跳过中间题', async () => {
      const token = await registerAndGetToken('u_jump_ok');
      const survey = await createSurvey(token, { title: '跳转测试', allowAnonymous: true });

      const q1 = (await addQuestion(token, survey._id, {
        type: 'single_choice',
        title: '路径选择',
        required: true,
        options: ['A', 'B'],
        jumpRules: [{ condition: { type: 'equals', value: 'A' }, targetQuestionOrder: 3 }],
      })).body;

      const q2 = (await addQuestion(token, survey._id, {
        type: 'text_input',
        title: '应该被跳过',
        required: true,
        validation: { minLength: 2 },
      })).body;

      const q3 = (await addQuestion(token, survey._id, {
        type: 'text_input',
        title: '最终题',
        required: true,
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

      // 确保被跳过题未保存
      const hasQ2 = saved.answers.some(a => String(a.questionId) === String(q2._id));
      expect(hasQ2).toBe(false);
    });

    test('不命中跳转规则时按默认顺序走下一题', async () => {
      const token = await registerAndGetToken('u_jump_default');
      const survey = await createSurvey(token, { title: '默认顺序测试', allowAnonymous: true });

      const q1 = (await addQuestion(token, survey._id, {
        type: 'single_choice',
        title: '路径选择',
        required: true,
        options: ['A', 'B'],
        jumpRules: [{ condition: { type: 'equals', value: 'A' }, targetQuestionOrder: 3 }],
      })).body;

      const q2 = (await addQuestion(token, survey._id, {
        type: 'text_input',
        title: '默认下一题',
        required: true,
        validation: { minLength: 2 },
      })).body;

      const q3 = (await addQuestion(token, survey._id, {
        type: 'text_input',
        title: '第三题',
        required: true,
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
      const token = await registerAndGetToken('u_validate_required');
      const survey = await createSurvey(token, { title: '必答校验', allowAnonymous: true });

      const q1 = (await addQuestion(token, survey._id, {
        type: 'single_choice',
        title: '必答单选',
        required: true,
        options: ['A', 'B'],
      })).body;

      await publishSurvey(token, survey._id);

      const submitRes = await request(app)
        .post(`/api/survey/${survey.shareCode}/submit`)
        .send({
          answers: [{ questionId: q1._id, value: '' }],
        });

      expect(submitRes.statusCode).toBe(400);
      expect(submitRes.body.error).toContain('必答题');
    });

    test('多选数量与数字范围校验生效', async () => {
      const token = await registerAndGetToken('u_validate_rules');
      const survey = await createSurvey(token, { title: '规则校验', allowAnonymous: true });

      const q1 = (await addQuestion(token, survey._id, {
        type: 'multiple_choice',
        title: '多选限制',
        required: true,
        options: ['苹果', '香蕉', '西瓜'],
        validation: { minSelect: 2, maxSelect: 2 },
      })).body;

      const q2 = (await addQuestion(token, survey._id, {
        type: 'number_input',
        title: '年龄',
        required: true,
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
      const token = await registerAndGetToken('u_submit_anonymous');
      const survey = await createSurvey(token, { title: '匿名提交', allowAnonymous: true });

      const q1 = (await addQuestion(token, survey._id, {
        type: 'single_choice',
        title: 'Q1',
        required: true,
        options: ['A', 'B'],
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
      const tokenA = await registerAndGetToken('u_submit_private_owner');
      const tokenB = await registerAndGetToken('u_submit_private_user');
      const survey = await createSurvey(tokenA, { title: '登录后提交', allowAnonymous: false });

      const q1 = (await addQuestion(tokenA, survey._id, {
        type: 'single_choice',
        title: 'Q1',
        required: true,
        options: ['A', 'B'],
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
      const ownerToken = await registerAndGetToken('u_stats_owner');
      const survey = await createSurvey(ownerToken, { title: '统计测试', allowAnonymous: true });

      const q1 = (await addQuestion(ownerToken, survey._id, {
        type: 'single_choice',
        title: '满意度',
        required: true,
        options: ['好', '一般'],
      })).body;

      const q2 = (await addQuestion(ownerToken, survey._id, {
        type: 'number_input',
        title: '分数',
        required: true,
        validation: { min: 0, max: 100 },
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
      const ownerToken = await registerAndGetToken('u_stats_owner2');
      const otherToken = await registerAndGetToken('u_stats_other');
      const survey = await createSurvey(ownerToken, { title: '统计权限测试' });

      const qRes = await addQuestion(ownerToken, survey._id, {
        type: 'single_choice',
        title: 'Q1',
        required: true,
        options: ['A', 'B'],
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
});
