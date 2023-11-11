const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const { User } = require('./models');

passport.use(new LocalStrategy({
  usernameField: 'email',
  passwordField: 'password'
}, async (email, password, done) => {
  try {
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return done(null, false, { message: '이메일이 존재하지 않습니다.' });
    }
    if (user.password !== password) {
      return done(null, false, { message: '비밀번호가 일치하지 않습니다.' });
    }
    return done(null, user);
  } catch (error) {
    console.error(error);
    return done(error);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findOne({ where: { id } });
    done(null, user);
  } catch (error) {
    console.error(error);
    done(error);
  }
});

module.exports = passport;
