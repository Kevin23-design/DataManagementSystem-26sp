const mongoose = require('mongoose');

const jumpRuleSchema = new mongoose.Schema({
  condition: {
    type: {
      type: String,
      enum: ['equals', 'contains', 'gt', 'lt', 'gte', 'lte'],
      required: true,
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
  },
  targetQuestionOrder: {
    type: Number,
    required: true,
  },
}, { _id: false });

const questionSchema = new mongoose.Schema({
  surveyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Survey',
    required: true,
    index: true,
  },
  order: {
    type: Number,
    required: true,
  },
  type: {
    type: String,
    enum: ['single_choice', 'multiple_choice', 'text_input', 'number_input'],
    required: true,
  },
  title: {
    type: String,
    required: [true, '题目标题不能为空'],
  },
  required: {
    type: Boolean,
    default: false,
  },
  options: {
    type: [String],
    default: [],
  },
  validation: {
    // 多选题
    minSelect: { type: Number, default: null },
    maxSelect: { type: Number, default: null },
    exactSelect: { type: Number, default: null },
    // 文本填空
    minLength: { type: Number, default: null },
    maxLength: { type: Number, default: null },
    // 数字填空
    min: { type: Number, default: null },
    max: { type: Number, default: null },
    integerOnly: { type: Boolean, default: false },
  },
  jumpRules: {
    type: [jumpRuleSchema],
    default: [],
  },
});

// 复合索引：按问卷+顺序查询
questionSchema.index({ surveyId: 1, order: 1 });

module.exports = mongoose.model('Question', questionSchema);
