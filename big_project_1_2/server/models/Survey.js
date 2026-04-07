const mongoose = require('mongoose');

const surveySchema = new mongoose.Schema({
  creatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  title: {
    type: String,
    required: [true, '问卷标题不能为空'],
    trim: true,
  },
  description: {
    type: String,
    default: '',
  },
  allowAnonymous: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'closed'],
    default: 'draft',
  },
  deadline: {
    type: Date,
    default: null,
  },
  shareCode: {
    type: String,
    unique: true,
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

surveySchema.pre('save', function () {
  this.updatedAt = new Date();
});

module.exports = mongoose.model('Survey', surveySchema);
