const { User } = require('../models');

const signup = async (req, res) => {
  try {
    await User.create({
      email: req.body.email,
      password: req.body.password,
    });
    res.json({ result: 'Insert success' });
  } catch (e) {
    console.error(e);
  }
};

module.exports = {
  signup: signup,
};