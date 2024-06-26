const express = require('express');
const router = express.Router();
const User = require('../models/User');
const authenticateToken = require('../middleware/authenticateToken');
const requireRole = require('../middleware/requireRole');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const securityKey = "ZohaibMughal";
const Validator = require('../utils/validators');
const mongoose = require('mongoose');
const Teachers = require('../models/Teacher');
const Courses = require('../models/Course');
const Comments = require('../models/Comment');
const Users = require('../models/User');
const upload = require('../middleware/uploadImage')


router.post("/register", async (req, res) => {
  try {
    var { email, password, firstname, lastname, erp, role } = req.body;

    // Validate input formats
    if (!Validator.emailValidator.validator(email) || !Validator.erpValidator.validator(erp)) {
      return res.status(400).json({ msg: "Please Enter a Valid Email Address or ERP" });
    }
    
    // Validate role format
    if (!['Admin', 'User'].includes(role)) {
      return res.status(400).json({ msg: "Invalid role specified. Role must be either 'Admin' or 'User'." });
    }

    email = email.toLowerCase();  

    // Check for existing records by email
    const existingUserByEmail = await User.findOne({ email });
    if (existingUserByEmail) {
      return res.status(409).json({ msg: "This email is already in use. Please use a different email." });
    }

    // Check for existing records by ERP
    const existingUserByErp = await User.findOne({ erp });
    if (existingUserByErp) {
      return res.status(409).json({ msg: "This ERP number is already in use. Please use a different ERP number." });
    }

    // Validate password strength
    if (!Validator.passwordValidator.validator(password)) {
      return res.status(400).json({ 
        msg: "Password must be at least 8 characters long, contain at least one uppercase letter, and one number."
      });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Set roles based on the selected role
    let roles = [role];
    if (role === 'Admin') {
      roles.push('User'); // Admins should also have the 'User' role
    }

    // Create the user
    const newUser = await User.create({ 
      email, 
      password: hashedPassword,
      firstname,
      lastname,
      erp,
      roles, // Assign the roles array
      createdby: email,
      createdat: new Date(),
      modifiedat: new Date()
    });
    
    // Successful registration
    return res.status(201).json({ msg: "Registration successful", user: newUser });
  } catch (error) {
    console.error(error);
    
    // Enhanced error handling based on error type
    if (error.name === 'ValidationError') {
      return res.status(400).json({ msg: "Validation error occurred.", details: error.message });
    } else if (error.code === 11000) {
      return res.status(409).json({ msg: "Duplicate key error. This resource already exists.", details: error.message });
    } else {
      return res.status(500).json({ msg: "Internal server error", details: error.message });
    }
  }
});
router.post("/login", async (req, res) => {
  console.log("Request body received:", req.body);

  try {
      var { loginUsername, password, role } = req.body;

      // Determine if the loginUsername is an ERP or an email
      let user;
      if (loginUsername.includes('@')) {
          loginUsername = loginUsername.toLowerCase();
          user = await User.findOne({ email: loginUsername });
      } else {
          if (!Validator.erpValidator.validator(loginUsername)) {
              return res.status(400).json({ msg: "Please Enter a Valid ERP or Email Address" });
          }
          user = await User.findOne({ erp: loginUsername });
      }

      if (!user) {
          return res.status(404).json({ msg: "This ERP or Email is not linked to any account" });
      }

      const passwordCheck = await bcrypt.compare(password, user.password);
      if (!passwordCheck) {
          return res.status(401).json({ msg: "Incorrect Password" });
      }

      // Check if the user is authorized for the selected role
      if (role === 'Admin' && !user.roles.includes('Admin')) {
          return res.status(403).json({ msg: "You do not have Admin privileges." });
      }

      // If the user is not an admin, they should only be allowed to log in as a User
      // if (role === 'User' && user.roles.includes('Admin')) {
      //     return res.status(403).json({ msg: "Admin cannot log in as User." });
      // }

      const token = jwt.sign({
          _id: user._id,
          erp: user.erp,
          email: user.email,
          roles: user.roles,
          firstname: user.firstname,
          lastname: user.lastname
      }, securityKey, { expiresIn: "10d" });

      // Create a new object excluding the password
      const userWithoutPassword = {
          _id: user._id,
          erp: user.erp,
          email: user.email,
          roles: user.roles,
          firstname: user.firstname,
          lastname: user.lastname
      };

      res.json({
          msg: "LOGGED IN",
          token,
          user: userWithoutPassword // Include the user details without the password
      });
  } catch (error) {
      console.log("An error occurred:", error);
      return res.status(500).json({ msg: "INTERNAL SERVER ERROR" });
  }
});


  router.get('/logout', async (req, res) => {
    try {
      // Invalidate token by removing it from the client-side storage
      res.clearCookie('token');
      // Optionally, set a very short expiry for the cookie to ensure it gets deleted
      res.status(200).json({ msg: 'Logged out successfully' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ msg: 'Internal server error' });
    }
  });
  
  router.patch('/changepassword',authenticateToken, requireRole("User"), async (req, res) => {
    try {
      const {oldpassword, newpassword } = req.body;
      const{erp}=req.user;
      if (oldpassword == newpassword) {
        return res.status(400).json({ msg: "New Password cannot be same as old password" });
      }
  
  
         // Check if the password is valid
         if (!Validator.passwordValidator.validator(oldpassword)) {
          return res.status(400).json({ 
            msg: "Old Password must contain at least 1 uppercase letter, 1 number, and have a length greater than 8."
          });
    }
   
   
      // Check if the password is valid
         if (!Validator.passwordValidator.validator(newpassword)) {
          return res.status(400).json({ 
            msg: "New Password must contain at least 1 uppercase letter, 1 number, and have a length greater than 8."
          });
    }
      // Attempt to find the user by ERP
      const user = await User.findOne({ erp });
      if (!user) {
        return res.status(404).json({ msg: "User not found with erp: " + erp });
      }
  
      // Check that the old password matches
      const passwordCheck = await bcrypt.compare(oldpassword, user.password);
      if (!passwordCheck) {
        return res.status(401).json({ msg: "Incorrect Password" }); // Unauthorized for wrong credentials
      }
  
      // Hash the new password before saving
      const hashedNewPassword = await bcrypt.hash(newpassword, 10); // Assuming a salt round of 10, adjust as needed
      user.password = hashedNewPassword;
      await user.save();
  
      res.status(200).json({ msg: "Password Changed Successfully" });
    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        // Handle JWT-specific errors
        console.log(error);
        return res.status(401).json({ msg: "Invalid Token" });
      }
      console.error(error);
      res.status(500).json({ msg: "Internal server error" });
    }
  });



  

router.get('/getuserprofile',authenticateToken, requireRole("User"),async(req,res)=>{
  
    const { erp } = req.user;
    try {
        const user = await User.findOne({ erp }, { password: 0 }); // Excluding password from the response
        if (!user) {
            return res.status(404).json({ msg: "User not found" });
        }
        res.json(user); // Respond with the user profile information
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: "Internal server error" });
    }
  
  });
  
  router.patch('/updateProfile', authenticateToken, upload.single('profile_picture'), async (req, res) => {
    const { updated_firstname, updated_lastname, updated_profile_picture } = req.body;
  
    try {
      const erp = req.user.erp;
  
      // Find the user by ERP
      const user = await User.findOne({ erp });
      if (!user) {
        return res.status(404).json({ msg: "User not found" });
      }
  
      // Apply the updates if provided
      if (updated_firstname) user.firstname = updated_firstname;
      if (updated_lastname) user.lastname = updated_lastname;
  
      // Handle profile picture
      if (updated_profile_picture) {
        // If profile picture is provided as a base64 string
        if (updated_profile_picture.startsWith('data:image/')) {
          user.profile_picture = updated_profile_picture;
        } else {
          return res.status(400).json({ msg: "Invalid base64 image format" });
        }
      } else if (req.file) {
        // If profile picture is provided as a file
        const base64Image = req.file.buffer.toString('base64');
        const mimeType = req.file.mimetype;
  
        // Combine mime type and base64 data into a single string
        user.profile_picture = `data:${mimeType};base64,${base64Image}`;
      }
  
      // Save the updated user
      await user.save();
  
      res.status(200).json({
        msg: "Profile updated successfully",
        user: {
          erp,
          email: user.email,
          firstname: user.firstname,
          lastname: user.lastname,
          profile_picture: user.profile_picture
        }
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ msg: "Internal server error" });
    }
  });


  
router.post('/saveComment',authenticateToken, async (req, res) => {
    const { commentId } = req.body;
    const erp = req.user.erp;
  
    console.log('Saving comment:', commentId, 'for user:', erp);
    // Validate the input
    if (!commentId || !mongoose.Types.ObjectId.isValid(commentId)) {
        return res.status(400).send('Invalid or missing comment ID.');
    }
    if (!erp) {
        return res.status(400).send('Missing user ERP.');
    }
  
    try {
        // Find the user by ERP and update
        const user = await User.findOneAndUpdate(
            { erp: erp },
            { $addToSet: { saved_comments: commentId } }, // $addToSet prevents duplicate ids
            { new: true } // Return the updated document
        );
  
        if (!user) {
            return res.status(404).send('User not found');
        }
  
        res.status(200).json(user);
    } catch (error) {
        // Handle specific error codes
        if (error.name === 'CastError') {
            res.status(400).send('Invalid data format.');
        } else if (error.name === 'ValidationError') {
            let messages = Object.values(error.errors).map(val => val.message);
            res.status(400).send(messages.join(', '));
        } else {
            console.error('Error saving comment:', error); // It's helpful to log the error for debugging.
            res.status(500).send('Server error');
        }
    }
  });
  
  
  
  router.post('/removefromsavedcomments', authenticateToken, async (req, res) => {
    const { commentId } = req.body;
    const erp = req.user.erp; // Adjust if ERP is located differently in your user object
  
    // Log the operation for debugging
    console.log('Removing comment:', commentId, 'for user:', erp);
  
    // Validate the input
    if (!commentId || !mongoose.Types.ObjectId.isValid(commentId)) {
        return res.status(400).send('Invalid or missing comment ID.');
    }
    if (!erp) {
        return res.status(400).send('Missing user ERP.');
    }
  
    try {
        // Find the user by ERP and update by pulling the commentId from saved_comments
        const user = await User.findOneAndUpdate(
            { erp: erp },
            { $pull: { saved_comments: commentId } }, // $pull removes the id from the array
            { new: true } // Return the updated document
        );
  
        if (!user) {
            return res.status(404).send('User not found');
        }
  
        res.status(200).json(user);
    } catch (error) {
        // Handle specific error codes
        if (error.name === 'CastError') {
            res.status(400).send('Invalid data format.');
        } else if (error.name === 'ValidationError') {
            let messages = Object.values(error.errors).map(val => val.message);
            res.status(400).send(messages.join(', '));
        } else {
            console.error('Error removing comment:', error); // Logging the error
            res.status(500).send('Server error');
        }
    }
  });
  
  
  
  router.get('/getSavedComments', authenticateToken, async (req, res) => {
    const erp = req.user.erp; // Assuming req.user.erp is populated by your authentication middleware
  
    try {
        // First, find the user to get their saved_comments
        const user = await User.findOne({ erp: erp });
        if (!user) {
            return res.status(404).send('User not found.');
        }
  
        // Extract the saved comment IDs from the user document and convert them to ObjectId instances
        const savedCommentIds = user.saved_comments.map(id => new mongoose.Types.ObjectId(id));
  
        // Now, fetch the actual comment data for these IDs from the comments collection
        const comments = await Comments.find({ '_id': { $in: savedCommentIds } });
  
        // Return the comments to the client
        res.status(200).json(comments);
    } catch (error) {
        console.error('Error fetching saved comments:', error); // Logging the error
        res.status(500).send('Server error');
    }
  });
  
  
  // Route to upvote a comment
  router.post('/upvotecomment', authenticateToken, async (req, res) => {
    const { commentId } = req.body;
    const userErp = req.user.erp; // Assuming you have middleware that sets req.user
  
    if (!commentId) {
        return res.status(400).send('Missing comment ID.');
    }
  
    try {
        // Find the comment to check if the user has already upvoted it
        const comment = await Comments.findById(commentId);
  
        if (!comment) {
            return res.status(404).send('Comment not found.');
        }
  
        // Check if the user's ERP is in the upvotedBy array
        if (comment.upvotedBy.includes(userErp)) {
            // User has already upvoted this comment
            return res.status(400).send('You have already upvoted this comment.');
        }
  
        // User has not upvoted yet, proceed to upvote
        const updatedComment = await Comments.findByIdAndUpdate(
            commentId,
            { 
                $inc: { upvotes: 1 }, // Increment upvotes by 1
                $push: { upvotedBy: userErp } // Add user's ERP to upvotedBy
            },
            { new: true, runValidators: true }
        );
  
        res.status(200).json(updatedComment);
    } catch (error) {
        console.error('Error upvoting comment:', error);
        res.status(500).send('Server error');
    }
  });
  
  
  
  router.post('/downvotecomment', authenticateToken, async (req, res) => {
    const { commentId } = req.body;
    const userErp = req.user.erp; // Assuming you have middleware that sets req.user
  
    if (!commentId) {
        return res.status(400).send('Missing comment ID.');
    }
  
    try {
        // Find the comment to check if the user has already downvoted it
        const comment = await Comments.findById(commentId);
  
        if (!comment) {
            return res.status(404).send('Comment not found.');
        }
  
        // Check if the user's ERP is in the downvotedBy array
        if (comment.downvotedBy.includes(userErp)) {
            // User has already downvoted this comment
            return res.status(400).send('You have already downvoted this comment.');
        }
  
        // User has not downvoted yet, proceed to downvote
        const updatedComment = await Comments.findByIdAndUpdate(
            commentId,
            { 
                $inc: { downvotes: 1 }, // Increment downvotes by 1
                $push: { downvotedBy: userErp } // Add user's ERP to downvotedBy
            },
            { new: true, runValidators: true }
        );
  
        res.status(200).json(updatedComment);
    } catch (error) {
        console.error('Error downvoting comment:', error);
        res.status(500).send('Server error');
    }
  });
  
  
  
  router.post('/saveteacher', authenticateToken, async (req, res) => {
    const { teacherId } = req.body;
    const erp = req.user.erp;
  
    if (!teacherId) {
        return res.status(400).send('Invalid or missing teacher ID.');
    }
  
    try {
        const user = await User.findOneAndUpdate(
            { erp: erp },
            { $addToSet: { saved_teachers: teacherId } },
            { new: true }
        );
  
        if (!user) {
            return res.status(404).send('User not found');
        }
  
        res.status(200).json(user);
    } catch (error) {
        console.error('Error saving teacher:', error);
        res.status(500).send('Server error');
    }
  });
  
  
  router.post('/removesavedteacher', authenticateToken, async (req, res) => {
    const { teacherId } = req.body;
    const erp = req.user.erp;
  
    if (!teacherId) {
        return res.status(400).send('Invalid or missing teacher ID.');
    }
  
    try {
        const user = await User.findOneAndUpdate(
            { erp: erp },
            { $pull: { saved_teachers: teacherId } },
            { new: true }
        );
  
        if (!user) {
            return res.status(404).send('User not found');
        }
  
        res.status(200).json(user);
    } catch (error) {
        console.error('Error removing saved teacher:', error);
        res.status(500).send('Server error');
    }
  });
  
  
  router.get('/getSavedTeachers', authenticateToken, async (req, res) => {
    const erp = req.user.erp;
  
    try {
        const user = await User.findOne({ erp: erp });
        if (!user || !user.saved_teachers.length) {
            return res.status(404).send('No saved teachers found.');
        }
  
        // Assuming you have a Teacher model set up
        const savedTeachers = await Teachers.find({
            '_id': { $in: user.saved_teachers }
        });
  
        res.status(200).json(savedTeachers);
    } catch (error) {
        console.error('Error fetching saved teachers:', error);
        res.status(500).send('Server error');
    }
  });
  
  
  router.post('/savecourse', authenticateToken, async (req, res) => {
    const { courseId } = req.body;
    const erp = req.user.erp;
  
    if (!courseId) {
      return res.status(400).send('Missing course ID.');
    }
  
    try {
      const user = await User.findOneAndUpdate(
        { erp: erp },
        { $addToSet: { saved_courses: courseId } },
        { new: true }
      );
  
      if (!user) {
        return res.status(404).send('User not found');
      }
  
      res.status(200).json(user);
    } catch (error) {
      console.error('Error saving course:', error);
      res.status(500).send('Server error');
    }
  });
  
  router.post('/removesavedcourse', authenticateToken, async (req, res) => {
    const { courseId } = req.body;
    const erp = req.user.erp;
  
    if (!courseId) {
      return res.status(400).send('Missing course ID.');
    }
  
    try {
      const user = await User.findOneAndUpdate(
        { erp: erp },
        { $pull: { saved_courses: courseId } },
        { new: true }
      );
  
      if (!user) {
        return res.status(404).send('User not found');
      }
  
      res.status(200).json(user);
    } catch (error) {
      console.error('Error removing course:', error);
      res.status(500).send('Server error');
    }
  });
  
  
  router.get('/getsavedcourses', authenticateToken, async (req, res) => {
    const erp = req.user.erp;
  
    try {
      const user = await User.findOne({ erp: erp });
      if (!user || !user.saved_courses.length) {
        return res.status(404).send('No saved courses found.');
      }
  
      const savedCourses = await Courses.find({ '_id': { $in: user.saved_courses } });
  
      res.status(200).json(savedCourses);
    } catch (error) {
      console.error('Error fetching saved courses:', error);
      res.status(500).send('Server error');
    }
  });
  
  
module.exports = router;
