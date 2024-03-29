const mongoose = require('mongoose');



const teacherSchema = new mongoose.Schema({
    Name: { type : String, required: true },
    Title: {type: String, default: 'Instructor'},
    Email: {type:String, default: ''},
    Overview: {type: String, default: ""},
    CoursesTaught:{type:  [String], default: []},
    CoursesTaughtIDs: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course'
    }],
    Department: {type: String, default:""},
    Specialization: {type: String, default:""},
    OnboardStatus: {type: String, default:"Avaialble"},
    ImageFile: {type: String, default:""},
    createdBy: {type: String, default:""},
    modifiedBy: {type: String, default:""},
    createdAt: {type:Date, default:Date.now},
    modifiedAt: {type:Date, default:Date.now},
    isDeleted: { type: Boolean, default: false }
  });
  
  
  // Create a model for your collection
  const Teachers = mongoose.model('Teachers', teacherSchema);
  
  module.exports = mongoose.model('Teacher', teacherSchema);
