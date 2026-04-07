/**
 * 跳转逻辑引擎
 * 根据当前题目的 jumpRules 和用户答案，决定下一题的 order
 *
 * @param {Object} question - 当前题目（含 jumpRules）
 * @param {*} answerValue - 用户对当前题目的回答
 * @param {Number} defaultNextOrder - 默认下一题的 order
 * @returns {Number} 下一题的 order
 */
function getNextQuestionOrder(question, answerValue, defaultNextOrder) {
  if (!question.jumpRules || question.jumpRules.length === 0) {
    return defaultNextOrder;
  }

  // Bug 1 修复: 没有作答时不尝试匹配跳转规则，直接走默认
  if (answerValue === undefined || answerValue === null || answerValue === '') {
    return defaultNextOrder;
  }
  // 多选空数组也视为未作答
  if (Array.isArray(answerValue) && answerValue.length === 0) {
    return defaultNextOrder;
  }

  for (const rule of question.jumpRules) {
    if (matchCondition(question.type, rule.condition, answerValue)) {
      return rule.targetQuestionOrder;
    }
  }

  return defaultNextOrder;
}

/**
 * 匹配单个条件
 * Bug 2 & 4 修复: 统一用 String 比较消除类型差异
 */
function matchCondition(questionType, condition, answerValue) {
  const { type: condType, value: condValue } = condition || {};

  switch (condType) {
    case 'equals':
      // 统一转 String 比较，避免前后端 "25" vs 25 不一致
      if (questionType === 'number_input') {
        return Number(answerValue) === Number(condValue);
      }
      return String(answerValue) === String(condValue);

    case 'contains':
      // 多选：答案数组包含某选项
      if (Array.isArray(answerValue)) {
        return answerValue.map(String).includes(String(condValue));
      }
      return false;

    case 'gt': {
      const a = Number(answerValue);
      const b = Number(condValue);
      return Number.isFinite(a) && Number.isFinite(b) && a > b;
    }
    case 'lt': {
      const a = Number(answerValue);
      const b = Number(condValue);
      return Number.isFinite(a) && Number.isFinite(b) && a < b;
    }
    case 'gte': {
      const a = Number(answerValue);
      const b = Number(condValue);
      return Number.isFinite(a) && Number.isFinite(b) && a >= b;
    }
    case 'lte': {
      const a = Number(answerValue);
      const b = Number(condValue);
      return Number.isFinite(a) && Number.isFinite(b) && a <= b;
    }

    default:
      return false;
  }
}

module.exports = { getNextQuestionOrder, matchCondition };
