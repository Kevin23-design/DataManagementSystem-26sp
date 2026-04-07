const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    required: true,
  },
  questionOrder: {
    type: Number,
    required: true,
  },
  value: {
    type: mongoose.Schema.Types.Mixed, // String | Number | [String]
    required: true,
  },
}, { _id: false });

const responseSchema = new mongoose.Schema({
  surveyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Survey',
    required: true,
    index: true,
  },
  respondentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null, // null = 匿名
  },
  answers: {
    type: [answerSchema],
    default: [],
  },
  submittedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Response', responseSchema);
