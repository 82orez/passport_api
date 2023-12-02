const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const { User } = require('./models');

passport.use(new LocalStrategy({
  usernameField: 'email',
  passwordField: 'password'
}, async (email, password, done) => {
  try {
    const user = await User.findOne({ where: { email } });
    if (!user) {
      // ! err, user, info 순으로 반환한다.
      return done(null, false, { result: '존재하지 않는 이메일입니다.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return done(null, false, { result: '비밀번호가 일치하지 않습니다.' });
    }

    return done(null, user);
  } catch (error) {
    console.error(error);
    return done(error);
  }
}));

// ? 유저 정보(user.id)를 이용해서 로그인 session 이 생성하고 저장하는 부분.
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// ? 생성된 session 의 user.id 를 사용하는 부분.
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
