const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const session = require('express-session');
const fs = require('fs');
const https = require('https');
const app = express();
const dotenv = require('dotenv');
dotenv.config();

const bcrypt = require('bcrypt');
const saltRounds = 10;

const { sequelize, User } = require('./models');
const passport = require('./passport');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const sessionStore = new SequelizeStore({
  db: sequelize,
});

//! mkcert 에서 발급한 인증서를 사용하기 위한 코드입니다. 삭제하지 마세요!
if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined'));

  const helmet = require('helmet');
  app.use(
    helmet.hsts({
      maxAge: 60 * 60 * 24 * 365, // 1 year
      includeSubDomains: true,
      preload: true,
    }),
  );
} else {
  app.use(morgan('dev'));

  app.use(
    cors({
      origin: 'http://localhost:3000',
      methods: ['GET', 'POST', 'OPTIONS'],
      credentials: true,
    }),
  );
}

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// express-session 라이브러리를 이용해 쿠키 설정을 해줄 수 있습니다.
const sessionOption = {
  secret: process.env.COOKIE_SECRET || '@codestates',
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    domain: process.env.NODE_ENV === 'production' ? 'infothings.net' : 'localhost',
    path: '/',
    sameSite: process.env.NODE_ENV === 'production' ? 'Strict' : 'none',
    httpOnly: true,
    secure: process.env.NODE_ENV !== 'production',
    // secure: process.env.NODE_ENV === 'production' ? false : true,
  },
};
if (process.env.NODE_ENV === 'production') {
  sessionOption.proxy = true;
}
app.use(session(sessionOption));

app.use(passport.initialize());
app.use(passport.session());

// ! React 배포 부분.
app.use('/', express.static(`${__dirname}/build`));
app.get('/', (req, res) => {
  if (`${__dirname}/index.html`) {
    res.sendFile(`${__dirname}/index.html`);
  }
  res.send('No index.html exists!');
});

// ! 라우터 부분 시작.
app.post('/signup', async (req, res) => {
  try {
    // 이메일이 이미 존재하는지 확인.
    const existingUser = await User.findOne({
      where: {
        email: req.body.email,
      },
    });

    // 이메일이 이미 존재하면 메시지를 보내고 종료.
    if (existingUser) {
      return res.json({ result: 'Existing Email' });
    }

    // 비밀번호를 암호화
    const hashedPassword = await bcrypt.hash(req.body.password, saltRounds);

    // 가입된 이메일이 없으면 새로운 사용자 생성
    await User.create({
      email: req.body.email,
      password: hashedPassword,
    });
    res.json({ result: 'Signup success' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '서버 에러' });
  }
});

app.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      console.error(err);
      return next(err);
    }

    if (!user) {
      return res.json(info);
    }

    // ? req.user 에 user 정보(id 등)가 할당 됨. (req.user = user)
    req.logIn(user, function (err) {
      console.log(user);
      if (err) {
        console.error(err);
        return next(err);
      }

      // 로그인 상태 유지: checkedKeepLogin 값에 따라 maxAge 설정
      if (req.body.checkedKeepLogin) {
        req.session.cookie.maxAge = 7 * 24 * 60 * 60 * 1000; // 7일
      }

      res.redirect('/userInfo');
    });
  })(req, res, next);
});

app.get('/userInfo', async (req, res) => {
  try {
    // 세션 정보에 user 정보가 정의되어 있는지 확인
    if (!req.user) {
      return res.json({ result: 'Not Login Info' });
    } else {
      res.json({ result: 'Login success', email: req.user.email });
    }
  } catch (e) {
    console.error(e);
  }
});

app.post('/logout', (req, res) => {
  if (!req.user) {
    res.status(400).send('Not Authorized');
  } else {
    req.session.destroy((err) => {
      if (err) {
        console.log(err);
      }
      res.json({ result: 'Logged Out Successfully' });
    });
  }
});

app.get('/auth/google', passport.authenticate('google', { prompt: 'select_account' }));
app.get(
  '/auth/google/callback',
  passport.authenticate('google', {
    successReturnToOrRedirect: process.env.NODE_ENV === 'production' ? '/' : 'http://localhost:3000',
    failureRedirect: process.env.NODE_ENV === 'production' ? '/login' : 'http://localhost:3000/login',
  }),
);

app.get('/auth/kakao', passport.authenticate('kakao'));
app.get('/auth/kakao/callback', function (req, res, next) {
  passport.authenticate('kakao', function (err, user, info) {
    if (err) {
      return next(err);
    }
    if (!user) {
      return res.redirect((process.env.NODE_ENV === 'production' ? '/' : 'http://localhost:3000') + '?message=' + encodeURIComponent(info.message));
    }
    req.logIn(user, function (err) {
      if (err) {
        return next(err);
      }
      return res.redirect(process.env.NODE_ENV === 'production' ? '/' : 'http://localhost:3000');
    });
  })(req, res, next);
});

// ! 새로고침 시에 cannot get 404 오류 방지 코드
if (process.env.NODE_ENV === 'production') {
  app.get('/*', function (req, res) {
    res.sendFile(`${__dirname}/build/index.html`, function (err) {
      if (err) {
        res.status(500).send(err);
      }
    });
  });
}

// 연결 객체를 이용해 DB 와 연결한다. sync 옵션은 원노트를 참조한다.
sequelize
  .sync({ force: true })
  .then(() => console.log('DB is ready'))
  .catch((e) => console.log(e));

// 세션 스토어를 DB 와 동기화.
sessionStore.sync();

const port = process.env.PORT || 4000;

if (process.env.NODE_ENV === 'production') {
  app.listen(port, () => console.log(`Server is running on port ${port}`));
} else {
  let server;
  if (fs.existsSync('/Users/tglee/developer/ssl/key.pem') && fs.existsSync('/Users/tglee/developer/ssl/cert.pem')) {
    const privateKey = fs.readFileSync('/Users/tglee/developer/ssl/key.pem', 'utf8');
    const certificate = fs.readFileSync('/Users/tglee/developer/ssl/cert.pem', 'utf8');
    const credentials = {
      key: privateKey,
      cert: certificate,
    };

    server = https.createServer(credentials, app);
    server.listen(port, () => console.log(`HTTPS Server is starting on ${port}`));
  } else {
    server = app.listen(port, () => console.log(`HTTP Server is starting on ${port}`));
  }
  module.exports = server;
}
