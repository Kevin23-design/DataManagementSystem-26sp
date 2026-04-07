const mongoose = require('mongoose');

const questionBankSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, '题库名称不能为空'],
    trim: true,
  },
  description: {
    type: String,
    default: '',
  },
  creatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  questionIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
  }],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

questionBankSchema.pre('save', function () {
  this.updatedAt = new Date();
});

module.exports = mongoose.model('QuestionBank', questionBankSchema);
