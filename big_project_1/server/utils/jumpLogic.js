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

  for (const rule of question.jumpRules) {
    if (matchCondition(question.type, rule.condition, answerValue)) {
      return rule.targetQuestionOrder;
    }
  }

  return defaultNextOrder;
}

/**
 * 匹配单个条件
 */
function matchCondition(questionType, condition, answerValue) {
  const { type: condType, value: condValue } = condition;

  switch (condType) {
    case 'equals':
      // 单选：值相等
      if (questionType === 'single_choice') {
        return answerValue === condValue;
      }
      // 数字：数值相等
      if (questionType === 'number_input') {
        return Number(answerValue) === Number(condValue);
      }
      return String(answerValue) === String(condValue);

    case 'contains':
      // 多选：答案数组包含某选项
      if (Array.isArray(answerValue)) {
        return answerValue.includes(condValue);
      }
      return false;

    case 'gt':
      return Number(answerValue) > Number(condValue);
    case 'lt':
      return Number(answerValue) < Number(condValue);
    case 'gte':
      return Number(answerValue) >= Number(condValue);
    case 'lte':
      return Number(answerValue) <= Number(condValue);

    default:
      return false;
  }
}

module.exports = { getNextQuestionOrder, matchCondition };
