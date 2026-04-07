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
  // ====== 归属 ======
  creatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  sharedWith: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],

  // ====== 版本链 ======
  rootQuestionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    default: null,
    index: true,
  },
  parentVersionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    default: null,
  },
  version: {
    type: Number,
    default: 1,
  },
  isLatest: {
    type: Boolean,
    default: true,
    index: true,
  },

  // ====== 题目内容 ======
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

  // ====== 时间戳 ======
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// 保存前更新时间
questionSchema.pre('save', function () {
  this.updatedAt = new Date();
});

// 保存后：首次创建时 rootQuestionId 指向自己
questionSchema.post('save', async function (doc) {
  if (!doc.rootQuestionId) {
    await mongoose.model('Question').updateOne(
      { _id: doc._id },
      { $set: { rootQuestionId: doc._id } },
    );
    doc.rootQuestionId = doc._id;
  }
});

// 索引
questionSchema.index({ sharedWith: 1 });

module.exports = mongoose.model('Question', questionSchema);
