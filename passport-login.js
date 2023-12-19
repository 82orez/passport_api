const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const session = require('express-session');
const fs = require('fs');
const https = require('https');
const app = express();
const dotenv = require('dotenv');
dotenv.config();

const nodemailer = require('nodemailer');
const crypto = require('crypto');

const bcrypt = require('bcrypt');
const saltRounds = 10;

const { sequelize, User } = require('./models');
const passport = require('./passport');
const { Op } = require('sequelize');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const sessionStore = new SequelizeStore({
  db: sequelize,
});

// ? mkcert 에서 발급한 인증서를 사용하기 위한 코드입니다. 삭제하지 마세요!
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

// ! 로그인 후, 뒤로가기 버튼 방지 코드
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// ? React 배포 부분.
app.use('/', express.static(`${__dirname}/build`));
app.get('/', (req, res) => {
  if (`${__dirname}/index.html`) {
    res.sendFile(`${__dirname}/index.html`);
  }
  res.send('No index.html exists!');
});

// ? 라우터 부분 시작.
app.post('/email', async (req, res) => {
  try {
    // ? Google, Kakao, Email 계정으로 가입된 이메일이 있는지 확인.
    const existingUser = await User.findOne({
      where: {
        // 클라이언트에서 보내온 이메일 값을 가지면서, provider 칼럼의 값이 null 이 아닌 경우: 여기에서는 provider 의 값이 Google, Kakao, Email 등인 경우.
        email: req.body.email,
        provider: {
          [Op.ne]: null,
        },
      },
    });
    // Google, Kakao, Email 계정(provider) 등으로 가입된 이메일이 존재하면 provider 의 값을 응답으로 보내고 종료.
    if (existingUser) {
      return res.json({ provider: `${existingUser.provider}` });
    }

    // ? 클라이언트에서 보내온 이메일 값이 아예 없거나, provider 값이 null 인 경우 다음 과정을 계속 진행.
    // token 발행: 6자리 난수 생성
    const token = crypto.randomBytes(3).toString('hex');

    // 현재 시각 저장
    // const now = new Date();

    // 메일 발송 설정
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.TOKEN_EMAIL,
        pass: process.env.APP_SECRET,
      },
    });

    // 메일 발송 옵션 설정
    const mailOptions = {
      from: process.env.TOKEN_EMAIL,
      to: req.body.email,
      subject: '회원가입 인증코드 메일입니다.',
      text: `인증 코드는 ${token} 입니다.`,
    };

    // 메일 발송
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        return console.log(error);
      }
      console.log('Email sent: ' + info.response);
    });

    // ? 가입된 이메일 계정이 없으면 새로운 사용자 생성
    const [user, created] = await User.findOrCreate({
      where: {
        email: req.body.email,
        provider: null,
      },
      defaults: {
        // ? findOrCreate 메소드가 사용자를 생성할 때 사용됩니다.
        token: token,

        // 테이블을 생성할 때 timestamps 옵션을 기본 값(true)을 사용하기 때문에 생성 시간을 저장하는 별도의 과정은 생략함.
        // createdAt: now,
      },
    });

    // ? 만약 사용자가 이미 존재한다면, 해당 사용자를 업데이트합니다.
    if (!created) {
      await user.update({
        token: token,

        // 테이블을 생성할 때 timestamps 옵션을 기본 값(true)을 사용하기 때문에 생성 시간을 저장하는 별도의 과정은 생략함.
        // updatedAt: now,
      });
    }

    res.json({ result: 'Check your email for verification code' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '서버 에러' });
  }
});

app.post('/verify', async (req, res) => {
  try {
    // 이메일과 토큰으로 사용자 찾기
    const user = await User.findOne({
      where: {
        email: req.body.email,
        token: req.body.token,
        provider: null,
      },
    });

    if (!user) {
      return res.json({ result: 'Invalid email or token' });
    }

    // 토큰 생성 시간 확인
    const now = new Date();
    const diff = Math.abs(now - user.updatedAt) / 1000; // 초 단위로 변환

    if (diff > 180) {
      // 3분 = 180초
      return res.json({ result: 'Token expired' });
    }

    res.json({ result: 'User verified' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '서버 에러' });
  }
});

app.post('/signup', async (req, res) => {
  try {
    // 비밀번호를 암호화
    const hashedPassword = await bcrypt.hash(req.body.password, saltRounds);

    // 가입된 이메일 계정이 없으면 새로운 사용자로 업데이트(provider: 'Email').
    await User.update(
      {
        password: hashedPassword,
        provider: 'Email',
        token: null,
      },
      {
        where: {
          email: req.body.email,
          provider: null,
        },
      },
    );
    res.json({ result: 'Signup success' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '서버 에러' });
  }
});

app.post('/login', (req, res, next) => {
  // passport-local 전략을 실행하고 전략으로부터 err, user, info 정보(값)을 받아온다.
  // 받아온 err, user, info 정보(값)이 err 이면 err 을 출력하고 종료하고, user 정보가 없으면(user: false) info 값을 클라이언트로 응답한다.
  // user 정보가 있으면 로그인 과정을 진행한다.
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      console.error(err);
      return next(err);
    }

    if (!user) {
      return res.json(info);
    }

    // ! req.user 에 user 정보(id 등)가 할당 됨. (req.user = user)
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
    // ? 세션 정보(req.user)에 user 정보(id 등)가 정의되어 있는지 확인.
    if (!req.user) {
      return res.json({ result: 'Not Login Info' });
    } else {
      // ? 결과 메세지와 user 정보를 클라이언트로 응답.
      res.json({ result: 'Login success', email: req.user.email, provider: req.user.provider });
    }
  } catch (e) {
    console.error(e);
  }
});

app.post('/logout', (req, res) => {
  if (!req.user) {
    res.status(400).send('Not Authorized');
  } else {
    req.logout((err) => {
      if (err) {
        console.log(err);
      }
      res.json({ result: 'Logged Out Successfully' });
    });
  }
});

app.get('/auth/google', passport.authenticate('google', { prompt: 'select_account' }));
app.get('/auth/google/callback', function (req, res, next) {
  passport.authenticate('google', function (err, user, info) {
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

app.get('/auth/naver', passport.authenticate('naver', { authType: 'reprompt' }));
app.get('/auth/naver/callback', function (req, res, next) {
  passport.authenticate('naver', function (err, user, info) {
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
