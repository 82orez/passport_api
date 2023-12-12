const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const KakaoStrategy = require('passport-kakao').Strategy;
const bcrypt = require('bcrypt');
const { User } = require('./models');
const { Op } = require('sequelize');

passport.use(
  new LocalStrategy(
    {
      usernameField: 'email',
      passwordField: 'password',
    },
    async (email, password, done) => {
      try {
        // 클라이언트로부터 받은 이메일 정보와 일치하고, provider 의 값이 null 이 아닌 Google, Kakao, Email 을 가진 데이터가 있는지 찾아 본다.
        const existingUser = await User.findOne({
          where: {
            email: email,
            provider: {
              [Op.ne]: null,
            },
          },
        });

        // ? err, user, info 순으로 반환한다.

        // 가입된 이메일 계정이 없으면 info 를 반환하고 종료한다.
        if (!existingUser) {
          return done(null, false, { result: '존재하지 않는 이메일입니다.' });
        }

        if (existingUser.provider !== 'Email') {
          return done(null, false, { result: `${existingUser.provider}` });
        }

        const isMatch = await bcrypt.compare(password, existingUser.password);
        if (!isMatch) {
          return done(null, false, { result: '비밀번호가 일치하지 않습니다.' });
        }

        return done(null, existingUser);
      } catch (error) {
        console.error(error);
        return done(error);
      }
    },
  ),
);

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:
        process.env.NODE_ENV === 'production' ? 'https://api.infothings.net/auth/google/callback' : 'https://localhost:4000/auth/google/callback',
      scope: ['email', 'profile'],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const existingUser = await User.findOne({
          where: {
            email: profile.emails[0].value,
            provider: {
              [Op.ne]: null,
            },
          },
        });
        if (existingUser) {
          if (existingUser.googleId) {
            // 구글 전략을 사용하여 이미 존재하는 사용자
            return done(null, existingUser);
          } else {
            // 다른 전략을 사용하는 존재하는 사용자
            return done(null, false, { message: `${existingUser.provider}` });
          }
        } else {
          // 새 사용자 생성
          const user = await User.create({
            googleId: profile.id,
            email: profile.emails[0].value,
            provider: 'Google',
          });
          return done(null, user);
        }
      } catch (err) {
        console.log(err);
        return done(err);
      }
    },
  ),
);

passport.use(
  new KakaoStrategy(
    {
      clientID: process.env.KAKAO_CLIENT_ID,
      callbackURL:
        process.env.NODE_ENV === 'production' ? 'https://api.infothings.net/auth/kakao/callback' : 'https://localhost:4000/auth/kakao/callback',
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const existingUser = await User.findOne({
          where: {
            email: profile._json.kakao_account.email,
            provider: {
              [Op.ne]: null,
            },
          },
        });
        if (existingUser) {
          if (existingUser.kakaoId) {
            return done(null, existingUser);
          } else {
            return done(null, false, { message: `${existingUser.provider}` });
          }
        } else {
          const user = await User.create({
            kakaoId: profile.id,
            email: profile._json.kakao_account.email,
            provider: 'Kakao',
          });
          return done(null, user);
        }
      } catch (err) {
        console.log(err);
        return done(err);
      }
    },
  ),
);

// ? 유저 정보(user.id)를 이용해서 로그인 session 을 생성하고 저장하는 부분.
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
