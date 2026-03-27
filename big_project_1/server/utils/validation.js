/**
 * 校验单个答案是否符合题目要求
 * @param {Object} question - 题目文档
 * @param {*} value - 用户提交的答案值
 * @returns {{ valid: boolean, message?: string }}
 */
function validateAnswer(question, value) {
  const { type, required: isRequired, options, validation } = question;

  // 检查必答题
  if (isRequired && (value === undefined || value === null || value === '')) {
    return { valid: false, message: `"${question.title}" 为必答题` };
  }

  // 非必答且无值，跳过
  if (value === undefined || value === null || value === '') {
    return { valid: true };
  }

  switch (type) {
    case 'single_choice': {
      if (!options.includes(value)) {
        return { valid: false, message: `"${question.title}" 选项无效` };
      }
      break;
    }

    case 'multiple_choice': {
      if (!Array.isArray(value)) {
        return { valid: false, message: `"${question.title}" 应为数组` };
      }
      for (const v of value) {
        if (!options.includes(v)) {
          return { valid: false, message: `"${question.title}" 包含无效选项: ${v}` };
        }
      }
      const count = value.length;
      if (validation.exactSelect != null && count !== validation.exactSelect) {
        return { valid: false, message: `"${question.title}" 必须选择 ${validation.exactSelect} 个` };
      }
      if (validation.minSelect != null && count < validation.minSelect) {
        return { valid: false, message: `"${question.title}" 至少选择 ${validation.minSelect} 个` };
      }
      if (validation.maxSelect != null && count > validation.maxSelect) {
        return { valid: false, message: `"${question.title}" 最多选择 ${validation.maxSelect} 个` };
      }
      break;
    }

    case 'text_input': {
      if (typeof value !== 'string') {
        return { valid: false, message: `"${question.title}" 应为文本` };
      }
      if (validation.minLength != null && value.length < validation.minLength) {
        return { valid: false, message: `"${question.title}" 至少输入 ${validation.minLength} 个字符` };
      }
      if (validation.maxLength != null && value.length > validation.maxLength) {
        return { valid: false, message: `"${question.title}" 最多输入 ${validation.maxLength} 个字符` };
      }
      break;
    }

    case 'number_input': {
      const num = Number(value);
      if (isNaN(num)) {
        return { valid: false, message: `"${question.title}" 应为数字` };
      }
      if (validation.integerOnly && !Number.isInteger(num)) {
        return { valid: false, message: `"${question.title}" 必须为整数` };
      }
      if (validation.min != null && num < validation.min) {
        return { valid: false, message: `"${question.title}" 不能小于 ${validation.min}` };
      }
      if (validation.max != null && num > validation.max) {
        return { valid: false, message: `"${question.title}" 不能大于 ${validation.max}` };
      }
      break;
    }

    default:
      return { valid: false, message: `未知题型: ${type}` };
  }

  return { valid: true };
}

module.exports = { validateAnswer };
